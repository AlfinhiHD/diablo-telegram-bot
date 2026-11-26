"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import Modal from "@/components/Modal";
import QuickLogModal from "@/components/QuickLogModal";
import { PaceRing } from "@/components/FinanceCharts";
import { PageSkeleton, Spinner } from "@/components/DiabloLoader";
import { useDiabloData } from "@/lib/diablo-client";
import { normalizeAgent, resolveUserCall } from "@/lib/agent-persona";
import { formatRupiah, formatShortDate } from "@/lib/format";
import {
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  CheckCircle,
  Check,
  Wallet,
  ArrowLeftRight,
  Lock,
  Receipt,
  ChevronRight,
  Bell,
  Scale,
  Clock,
  CreditCard,
  Pencil,
  ShoppingBag,
  ExternalLink,
  ListChecks,
  Terminal,
} from "lucide-react";

const HASH_TO_TAB = {
  "#dompet": "dompet",
  "#gajian": "gajian",
  "#tagihan": "tagihan",
  "#utang": "tagihan",
  "#cicilan": "cicilan",
  "#wishlist": "wishlist",
};

export default function TabunganPage() {
  const { data, loading, reload } = useDiabloData();
  const agent = normalizeAgent(data?.profile?.agent);
  const userCall = resolveUserCall(agent, data?.profile?.ownerName);
  const [mounted, setMounted] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("dompet");

  // Modal Tambah Pos Tabungan
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [newPotTarget, setNewPotTarget] = useState("");
  const [newPotSaved, setNewPotSaved] = useState("");
  const [newPotMonthly, setNewPotMonthly] = useState("");

  // Modal Top up Pos
  const [topUpPotId, setTopUpPotId] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");

  // Modal Transfer Antar Dompet / Bayar PayLater
  const [transferOpen, setTransferOpen] = useState(false);
  const [trFrom, setTrFrom] = useState("");
  const [trTo, setTrTo] = useState("");
  const [trAmount, setTrAmount] = useState("");

  // Modal Audit Saldo (Surplus / Gap Checker)
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditInputs, setAuditInputs] = useState({});

  // Modal Bayar Tagihan Tetap
  const [payBillTarget, setPayBillTarget] = useState(null);
  const [payBillWalletId, setPayBillWalletId] = useState("bni");
  const [payBillAmount, setPayBillAmount] = useState("");

  // Modal Tambah Utang/Piutang
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtType, setDebtType] = useState("piutang");
  const [debtPerson, setDebtPerson] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtNote, setDebtNote] = useState("");

  // Modal Lunasi Utang/Piutang
  const [settleTarget, setSettleTarget] = useState(null);
  const [settleWalletId, setSettleWalletId] = useState("bni");
  const [settleAmount, setSettleAmount] = useState("");
  const [debtTab, setDebtTab] = useState("open");

  // Modal Sesuaikan (Kurangi / Tambah) Utang/Piutang
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustMode, setAdjustMode] = useState("sub");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Cicilan Berjangka
  const [instTab, setInstTab] = useState("active");
  const [instModalOpen, setInstModalOpen] = useState(false);
  const [editingInst, setEditingInst] = useState(null);
  const [instPerson, setInstPerson] = useState("");
  const [instLabel, setInstLabel] = useState("");
  const [instTotal, setInstTotal] = useState("");
  const [instMonthly, setInstMonthly] = useState("");
  const [instDueDay, setInstDueDay] = useState("27");
  const [instTargetWalletId, setInstTargetWalletId] = useState("saqu_utama");
  const [instNote, setInstNote] = useState("");
  const [payInstTarget, setPayInstTarget] = useState(null);
  const [payInstAmount, setPayInstAmount] = useState("");
  const [payInstWalletId, setPayInstWalletId] = useState("saqu_utama");
  const [payInstNote, setPayInstNote] = useState("");
  const [payInstLogTx, setPayInstLogTx] = useState(true);

  // Wishlist Belanja
  const [wishlistTab, setWishlistTab] = useState("planned");
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [editingWish, setEditingWish] = useState(null);
  const [wishName, setWishName] = useState("");
  const [wishPrice, setWishPrice] = useState("");
  const [wishSaved, setWishSaved] = useState("");
  const [wishUrl, setWishUrl] = useState("");
  const [wishPriority, setWishPriority] = useState("medium");
  const [wishNote, setWishNote] = useState("");
  const [buyWishTarget, setBuyWishTarget] = useState(null);
  const [buyWishWalletId, setBuyWishWalletId] = useState("bni");
  const [buyWishAmount, setBuyWishAmount] = useState("");
  const [buyWishLogTx, setBuyWishLogTx] = useState(true);

  // Modal Template Alokasi Gajian
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState([]);

  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    function syncFromHash() {
      const next = HASH_TO_TAB[window.location.hash];
      if (next) setActiveSection(next);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const wallets = data?.profile?.wallets || [];
  const pots = data?.profile?.savingsPots || [];
  const paydayChecklist = data?.analytics?.paydayChecklist;
  const wishlists = data?.profile?.wishlists || [];
  const plannedWishlists = wishlists.filter((w) => w.status !== "bought");
  const boughtWishlists = wishlists
    .filter((w) => w.status === "bought")
    .sort((a, b) => new Date(b.boughtAt || b.createdAt || 0) - new Date(a.boughtAt || a.createdAt || 0));
  const totalWishlistPlanned = plannedWishlists.reduce((a, w) => a + (Number(w.price) || 0), 0);
  const reminders = data?.analytics?.reminders;
  const upcomingBills = reminders?.upcomingBills || [];
  const allDebts = data?.profile?.debts || [];
  const openDebts = (reminders?.openDebts || allDebts).filter((d) => d.status !== "paid");
  const paidDebts = allDebts
    .filter((d) => d.status === "paid")
    .sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0));
  const utangList = openDebts.filter((d) => d.type === "utang");
  const piutangList = openDebts.filter((d) => d.type === "piutang");
  const paidUtangList = paidDebts.filter((d) => d.type === "utang");
  const paidPiutangList = paidDebts.filter((d) => d.type === "piutang");

  const allInstallments = data?.profile?.installments || [];
  const upcomingInstallments = reminders?.upcomingInstallments || [];
  const activeInstallments =
    upcomingInstallments.length > 0
      ? upcomingInstallments
      : allInstallments.filter((it) => it.status !== "paid");
  const paidInstallments = allInstallments
    .filter((it) => it.status === "paid")
    .sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0));
  const totalInstallmentRemaining = activeInstallments.reduce(
    (a, it) => a + Math.max(0, (Number(it.totalAmount) || 0) - (Number(it.paidAmount) || 0)),
    0
  );

  const simplifiableGroups = (() => {
    const map = new Map();
    for (const d of openDebts) {
      if (d.amount === null || Number(d.amount) <= 0) continue;
      const key = String(d.person || "").toLowerCase().trim();
      if (!key) continue;
      const arr = map.get(key) || [];
      arr.push(d);
      map.set(key, arr);
    }
    const groups = [];
    for (const items of map.values()) {
      const piutangTotal = items.filter((d) => d.type === "piutang").reduce((a, d) => a + Number(d.amount), 0);
      const utangTotal = items.filter((d) => d.type === "utang").reduce((a, d) => a + Number(d.amount), 0);
      const hasBoth = piutangTotal > 0 && utangTotal > 0;
      if (!hasBoth && items.length <= 1) continue;
      groups.push({
        person: items[0].person,
        piutangTotal,
        utangTotal,
        hasBoth,
        net: piutangTotal - utangTotal,
        count: items.length,
      });
    }
    return groups;
  })();

  const totalSaved = pots.reduce((acc, p) => acc + (Number(p.saved) || 0), 0);
  const totalTarget = pots.reduce((acc, p) => acc + (Number(p.target) || 0), 0);
  const totalProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  const pendingPaydayCount = Math.max(
    0,
    (paydayChecklist?.totalCount || 0) - (paydayChecklist?.doneCount || 0)
  );
  const unpaidBillsCount = upcomingBills.filter(
    (b) => b.amount > 0 && !b.paidInCurrentCycle && b.urgency !== "INACTIVE"
  ).length;
  const attentionCount = openDebts.length + activeInstallments.length + pendingPaydayCount;

  function openAuditModal() {
    const init = {};
    for (const w of wallets.filter((x) => !x.locked)) {
      init[w.id] = String(w.balance);
    }
    setAuditInputs(init);
    setAuditOpen(true);
  }

  async function handleApplyAudit(e) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const items = wallets
        .filter((w) => !w.locked && auditInputs[w.id] !== undefined && auditInputs[w.id] !== "")
        .map((w) => ({ walletId: w.id, actual: Number(auditInputs[w.id]) || 0 }));
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "audit_apply", items }),
      });
      if (res.ok) {
        setAuditOpen(false);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePayBill(e) {
    e.preventDefault();
    if (!payBillTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pay_bill",
          billId: payBillTarget.id,
          walletId: payBillWalletId,
          amount: Number(payBillAmount) || payBillTarget.dueAmount || payBillTarget.amount,
        }),
      });
      if (res.ok) {
        setPayBillTarget(null);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSnoozeDebt(debtId) {
    const res = await fetch("/api/diablo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "snooze_debt", debtId, days: 3 }),
    });
    if (res.ok) await reload();
  }

  async function handleAddPot(e) {
    e.preventDefault();
    if (!newPotName.trim()) return;
    setActionLoading(true);
    try {
      const newPot = {
        id: "pot_" + Date.now(),
        name: newPotName.trim(),
        target: Number(newPotTarget) || 0,
        saved: Number(newPotSaved) || 0,
        monthly: Number(newPotMonthly) || 0,
      };
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_pots", pots: [...pots, newPot] }),
      });
      if (res.ok) {
        setNewPotName("");
        setNewPotTarget("");
        setNewPotSaved("");
        setNewPotMonthly("");
        setIsAddOpen(false);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTopUp(e) {
    e.preventDefault();
    if (!topUpPotId || !topUpAmount) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_to_pot", potId: topUpPotId, amount: Number(topUpAmount) || 0 }),
      });
      if (res.ok) {
        setTopUpPotId(null);
        setTopUpAmount("");
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeletePot(potId) {
    if (!confirm("Hapus pos tabungan ini?")) return;
    const res = await fetch("/api/diablo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_pots", pots: pots.filter((p) => p.id !== potId) }),
    });
    if (res.ok) await reload();
  }

  async function handleTransfer(e) {
    e.preventDefault();
    if (!trFrom || !trTo || !trAmount) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer_wallet",
          fromWalletId: trFrom,
          toWalletId: trTo,
          amount: Number(trAmount) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transfer gagal");
      setTransferOpen(false);
      setTrAmount("");
      await reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddDebt(e) {
    e.preventDefault();
    if (!debtPerson.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_debt",
          type: debtType,
          person: debtPerson.trim(),
          amount: debtAmount ? Number(debtAmount) : null,
          note: debtNote.trim(),
        }),
      });
      if (res.ok) {
        setDebtPerson("");
        setDebtAmount("");
        setDebtNote("");
        setDebtModalOpen(false);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSettleDebt(e) {
    e.preventDefault();
    if (!settleTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settle_debt",
          debtId: settleTarget.id,
          walletId: settleWalletId,
          amount: settleAmount ? Number(settleAmount) : settleTarget.amount,
        }),
      });
      if (res.ok) {
        setSettleTarget(null);
        setSettleAmount("");
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteDebt(debtId) {
    if (!confirm("Hapus catatan utang/piutang ini?")) return;
    const res = await fetch("/api/diablo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_debt", debtId }),
    });
    if (res.ok) await reload();
  }

  async function handleSimplifyDebts() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simplify_debts" }),
      });
      if (res.ok) await reload();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdjustDebt(e) {
    e.preventDefault();
    if (!adjustTarget || !adjustAmount) return;
    setActionLoading(true);
    try {
      const signedDelta = (adjustMode === "sub" ? -1 : 1) * (Number(adjustAmount) || 0);
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_debt",
          debtId: adjustTarget.id,
          delta: signedDelta,
          reason: adjustReason.trim(),
        }),
      });
      if (res.ok) {
        setAdjustTarget(null);
        setAdjustAmount("");
        setAdjustReason("");
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  function openNewWishModal() {
    setEditingWish(null);
    setWishName("");
    setWishPrice("");
    setWishSaved("");
    setWishUrl("");
    setWishPriority("medium");
    setWishNote("");
    setWishModalOpen(true);
  }

  function openEditWishModal(w) {
    setEditingWish(w);
    setWishName(w.name || "");
    setWishPrice(w.price ? String(w.price) : "");
    setWishSaved(w.saved ? String(w.saved) : "");
    setWishUrl(w.url || "");
    setWishPriority(w.priority || "medium");
    setWishNote(w.note || "");
    setWishModalOpen(true);
  }

  async function handleSaveWishlist(e) {
    e.preventDefault();
    if (!wishName.trim()) return;
    setActionLoading(true);
    try {
      const payload = editingWish
        ? {
            action: "update_wishlist",
            wishlistId: editingWish.id,
            patch: {
              name: wishName.trim(),
              price: Number(wishPrice) || 0,
              saved: Number(wishSaved) || 0,
              url: wishUrl.trim(),
              priority: wishPriority,
              note: wishNote.trim(),
            },
          }
        : {
            action: "add_wishlist",
            name: wishName.trim(),
            price: Number(wishPrice) || 0,
            saved: Number(wishSaved) || 0,
            url: wishUrl.trim(),
            priority: wishPriority,
            note: wishNote.trim(),
          };
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setWishModalOpen(false);
        setEditingWish(null);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBuyWishlist(e) {
    e.preventDefault();
    if (!buyWishTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "buy_wishlist",
          wishlistId: buyWishTarget.id,
          walletId: buyWishLogTx ? buyWishWalletId : "",
          amount: Number(buyWishAmount) || buyWishTarget.price || 0,
          logTx: buyWishLogTx,
        }),
      });
      if (res.ok) {
        setBuyWishTarget(null);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  function openNewInstModal() {
    setEditingInst(null);
    setInstPerson("");
    setInstLabel("");
    setInstTotal("");
    setInstMonthly("");
    setInstDueDay("27");
    setInstTargetWalletId(
      wallets.find((w) => w.id === "saqu_utama")?.id ||
        wallets.find((w) => w.role === "saving" && !w.locked)?.id ||
        wallets[0]?.id ||
        ""
    );
    setInstNote("");
    setInstModalOpen(true);
  }

  function openEditInstModal(inst) {
    setEditingInst(inst);
    setInstPerson(inst.person || "");
    setInstLabel(inst.label || "");
    setInstTotal(inst.totalAmount ? String(inst.totalAmount) : "");
    setInstMonthly(inst.monthlyAmount ? String(inst.monthlyAmount) : "");
    setInstDueDay(inst.dueDay ? String(inst.dueDay) : "27");
    setInstTargetWalletId(inst.targetWalletId || "");
    setInstNote(inst.note || "");
    setInstModalOpen(true);
  }

  async function handleSaveInstallment(e) {
    e.preventDefault();
    if (!instPerson.trim() && !instLabel.trim()) return;
    setActionLoading(true);
    try {
      const totalNum = Math.max(0, Number(instTotal) || 0);
      const monthlyNum = Math.max(0, Number(instMonthly) || 0);
      const computedMonths =
        monthlyNum > 0 && totalNum > 0 ? Math.max(1, Math.ceil(totalNum / monthlyNum)) : 1;
      const payload = editingInst
        ? {
            action: "update_installment",
            installmentId: editingInst.id,
            patch: {
              person: instPerson.trim() || editingInst.person,
              label: instLabel.trim() || `Cicilan ${instPerson.trim() || editingInst.person}`,
              totalAmount: totalNum,
              monthlyAmount: monthlyNum,
              totalMonths: computedMonths,
              dueDay: Math.min(28, Math.max(1, Number(instDueDay) || 27)),
              targetWalletId: instTargetWalletId,
              note: instNote.trim(),
            },
          }
        : {
            action: "add_installment",
            person: instPerson.trim() || instLabel.trim(),
            label: instLabel.trim() || `Cicilan ${instPerson.trim()}`,
            totalAmount: totalNum,
            monthlyAmount: monthlyNum,
            totalMonths: computedMonths,
            dueDay: Math.min(28, Math.max(1, Number(instDueDay) || 27)),
            targetWalletId: instTargetWalletId,
            note: instNote.trim(),
          };
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setInstModalOpen(false);
        setEditingInst(null);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  function openPayInstModal(inst) {
    const remaining = Math.max(0, (Number(inst.totalAmount) || 0) - (Number(inst.paidAmount) || 0));
    const suggested = Math.min(remaining, Number(inst.monthlyAmount) || remaining);
    setPayInstTarget(inst);
    setPayInstAmount(suggested > 0 ? String(suggested) : "");
    setPayInstWalletId(
      inst.targetWalletId ||
        wallets.find((w) => w.id === "saqu_utama")?.id ||
        wallets.find((w) => !w.locked && w.role !== "credit")?.id ||
        "bni"
    );
    setPayInstNote("");
    setPayInstLogTx(true);
  }

  async function handlePayInstallment(e) {
    e.preventDefault();
    if (!payInstTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pay_installment",
          installmentId: payInstTarget.id,
          amount: Number(payInstAmount) || payInstTarget.monthlyAmount || 0,
          walletId: payInstWalletId,
          logTx: payInstLogTx,
          note: payInstNote.trim(),
        }),
      });
      if (res.ok) {
        setPayInstTarget(null);
        setPayInstAmount("");
        setPayInstNote("");
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteInstallment(instId) {
    if (!confirm("Hapus catatan cicilan berjangka ini?")) return;
    const res = await fetch("/api/diablo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_installment", installmentId: instId }),
    });
    if (res.ok) await reload();
  }

  async function handleDeleteWishlist(wishlistId) {
    if (!confirm("Hapus item ini dari daftar incaran?")) return;
    const res = await fetch("/api/diablo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_wishlist", wishlistId }),
    });
    if (res.ok) await reload();
  }

  function openPlanModal() {
    const existing = data?.profile?.paydayPlan || [];
    setPlanDraft(
      existing.length > 0
        ? existing.map((x) => ({ ...x }))
        : [
            {
              id: `pd_${Date.now()}`,
              label: "Tabungan Rutin",
              type: "transfer",
              amount: 1000000,
              fromWalletId: wallets.find((w) => w.role === "daily")?.id || "bni",
              toWalletId: wallets.find((w) => w.role === "saving")?.id || "saqu",
              billId: "",
              note: "",
            },
          ]
    );
    setPlanModalOpen(true);
  }

  async function handleCompletePaydayStep(stepId, applyWallet = true) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_payday_step", stepId, applyWallet }),
      });
      if (res.ok) await reload();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUncheckPaydayStep(stepId) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uncheck_payday_step", stepId }),
      });
      if (res.ok) await reload();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSavePaydayPlan(e) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const cleanItems = planDraft
        .filter((it) => String(it.label || "").trim())
        .map((it) => ({
          ...it,
          amount: Math.max(0, Number(it.amount) || 0),
        }));
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_payday_plan", items: cleanItems }),
      });
      if (res.ok) {
        setPlanModalOpen(false);
        await reload();
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (!mounted || (loading && !data)) {
    return (
      <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
        <Nav />
        <PageSkeleton variant="tabungan" />
      </div>
    );
  }

  const auditDiffTotal = wallets
    .filter((w) => !w.locked)
    .reduce((acc, w) => acc + ((Number(auditInputs[w.id]) || 0) - (Number(w.balance) || 0)), 0);

  const sectionTabs = [
    {
      key: "dompet",
      label: "Dompet & Pos",
      icon: Wallet,
      badge: wallets.length + pots.length,
    },
    {
      key: "gajian",
      label: "Checklist Bagi Gaji",
      icon: ListChecks,
      badge:
        paydayChecklist?.totalCount > 0
          ? `${paydayChecklist.doneCount}/${paydayChecklist.totalCount}`
          : null,
    },
    {
      key: "tagihan",
      label: "Tagihan & Utang",
      icon: Receipt,
      badge: unpaidBillsCount + openDebts.length > 0 ? unpaidBillsCount + openDebts.length : null,
    },
    {
      key: "cicilan",
      label: "Piutang Cicilan",
      icon: Clock,
      badge: activeInstallments.length > 0 ? activeInstallments.length : null,
    },
    {
      key: "wishlist",
      label: "Wishlist Belanja",
      icon: ShoppingBag,
      badge: plannedWishlists.length > 0 ? plannedWishlists.length : null,
    },
  ];

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} profile={data?.profile} onQuickLog={() => setQuickLogOpen(true)} />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5">
        {/* Header Title & Top Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Pos Tabungan Fleksibel
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Dompet, alokasi gajian, tagihan, utang, dan target tabungan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {wallets.length > 0 && (
              <button
                type="button"
                onClick={openAuditModal}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-slate-200 font-semibold text-xs border border-[var(--border-default)] pressable"
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Audit Saldo</span>
              </button>
            )}
            {wallets.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setTrFrom(wallets[0]?.id || "");
                  setTrTo(wallets[1]?.id || "");
                  setTransferOpen(true);
                }}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-slate-200 font-semibold text-xs border border-[var(--border-default)] pressable"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                <span>Pindah Dana</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] font-semibold text-xs btn-primary-diablo pressable"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Tambah Pos</span>
            </button>
          </div>
        </div>

        {/* Obsidian Summary Vault */}
        <section
          data-tone="accent"
          className="hero-vault rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]"
        >
          <div className="pb-4 md:pb-0 md:pr-6 flex flex-col justify-center">
            <span className="text-[11px] text-slate-400 block">Aset Bersih</span>
            <strong className="text-xl font-bold font-heading tabular-nums text-emerald-400 mt-0.5 block">
              {formatRupiah(data?.analytics?.walletSummary?.netWorthTotal ?? 0)}
            </strong>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {wallets.length} sumber dana tercatat
            </span>
          </div>

          <div className="py-4 md:py-0 md:px-6 flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-0.5">
              <span className="text-[11px] text-slate-400 block">Pos Tabungan</span>
              <div className="text-lg font-bold font-heading tabular-nums text-slate-100">
                {formatRupiah(totalSaved)}
              </div>
              <span className="text-[11px] text-slate-400 block">
                Target: {formatRupiah(totalTarget)}
              </span>
            </div>
            <PaceRing
              size={58}
              strokeWidth={5.5}
              percent={totalProgress}
              tone="accent"
              centerValue={`${totalProgress}%`}
            />
          </div>

          <div className="pt-4 md:pt-0 md:pl-6 flex flex-col justify-center">
            <span className="text-[11px] text-slate-400 block">Perlu Perhatian</span>
            <strong className="text-xl font-bold font-heading tabular-nums text-slate-100 mt-0.5 block">
              {attentionCount} item
            </strong>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {openDebts.length} utang/piutang · {activeInstallments.length} cicilan · {pendingPaydayCount} gajian
            </span>
          </div>
        </section>

        {/* 5-Tab Workspace Navigation Bar */}
        <div
          role="tablist"
          aria-label="Bagian tabungan dan kewajiban"
          className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-inset)] p-1.5 rounded-2xl border border-[var(--border-subtle)]"
        >
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(tab.key)}
                className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition pressable ${
                  active
                    ? "bg-[var(--bg-active)] text-slate-100 border border-accent-500/40 shadow-xs"
                    : "text-slate-400 hover:text-slate-100 border border-transparent hover:bg-[var(--hover-tint)]"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${active ? "text-accent-300" : "text-slate-400"}`}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
                {tab.badge !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono-num ${
                      active ? "bg-accent-500/20 text-accent-200" : "bg-[var(--track-bg)] text-slate-400"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: DOMPET & POS */}
        {activeSection === "dompet" && (
          <div className="space-y-5">
            {wallets.length > 0 && (
              <section className="surface-card rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-accent-300" aria-hidden="true" />
                    <span>Sumber Dana & PayLater</span>
                  </h2>
                  <span className="text-xs font-mono-num text-emerald-400 font-semibold">
                    Bersih: {formatRupiah(data?.analytics?.walletSummary?.netWorthTotal ?? 0)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {wallets.map((w) => {
                    const isCredit = w.role === "credit";
                    const hasDebt = isCredit && w.balance < 0;
                    return (
                      <Link
                        key={w.id}
                        href={`/riwayat?wallet=${encodeURIComponent(w.id)}`}
                        className={`wallet-tile p-3.5 rounded-xl flex items-center justify-between gap-2 group pressable ${
                          hasDebt ? "border-t-2 border-t-rose-400/80" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-slate-100 truncate" title={w.name}>
                              {w.name}
                            </span>
                            {w.locked && <Lock className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />}
                            {isCredit && <CreditCard className="w-3 h-3 text-rose-400 shrink-0" aria-hidden="true" />}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {w.locked
                              ? "Dana Darurat (Terkunci)"
                              : isCredit
                              ? hasDebt
                                ? "Tagihan Berjalan"
                                : "PayLater (Lunas)"
                              : w.role === "daily"
                              ? "Dana Harian"
                              : "Simpanan"}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-1 shrink-0">
                          <span
                            className={`text-sm font-bold font-mono-num whitespace-nowrap ${
                              hasDebt ? "text-rose-400" : w.locked ? "text-amber-300" : "text-emerald-400"
                            }`}
                          >
                            {formatRupiah(w.balance)}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-200 shrink-0" aria-hidden="true" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="surface-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>Target Pos Tabungan ({pots.length})</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] text-slate-200 border border-[var(--border-default)] text-xs font-semibold pressable"
                >
                  <Plus className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                  <span>Tambah Pos</span>
                </button>
              </div>

              {pots.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-slate-400">
                    <PiggyBank className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <p className="text-xs text-slate-400">
                    Belum ada pos tabungan khusus. Buat target terpisah untuk dana darurat atau rencana pembelian.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] font-semibold text-xs pressable"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Tambah Pos Sekarang</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {pots.map((pot) => {
                    const target = Number(pot.target) || 0;
                    const saved = Number(pot.saved) || 0;
                    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

                    return (
                      <div
                        key={pot.id}
                        className="p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-3.5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-slate-100 text-sm">{pot.name}</h3>
                            <button
                              type="button"
                              onClick={() => handleDeletePot(pot.id)}
                              aria-label={`Hapus pos ${pot.name}`}
                              title="Hapus Pos"
                              className="text-slate-400 hover:text-rose-300 p-1 rounded-lg hover:bg-rose-500/10 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="mt-3 flex items-baseline justify-between text-xs">
                            <span className="text-base font-bold font-heading tabular-nums text-emerald-400">
                              {formatRupiah(saved)}
                            </span>
                            <span className="text-slate-400 text-[11px] font-mono-num">
                              Target: {formatRupiah(target)}
                            </span>
                          </div>
                          <div className="mt-2 w-full h-1.5 bg-[var(--track-bg)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-500 rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-1 text-right text-[11px] text-slate-400 font-mono-num">
                            {pct}% tercapai
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setTopUpPotId(pot.id);
                            setTopUpAmount("");
                          }}
                          className="w-full min-h-[36px] py-2 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-slate-100 text-xs font-medium flex items-center justify-center gap-1.5 pressable"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                          <span>+ Isi Tabungan</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="px-4 py-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center gap-2.5 text-xs text-slate-400">
              <Terminal className="w-4 h-4 text-accent-300 shrink-0" aria-hidden="true" />
              <span>
                Shortcut Telegram:{" "}
                <code className="font-mono text-slate-200">/reminder</code> cek tagihan,{" "}
                <code className="font-mono text-slate-200">/saldo</code> cek surplus, atau{" "}
                <code className="font-mono text-slate-200">audit bni 35k cash 273k</code>.
              </span>
            </div>
          </div>
        )}

        {/* TAB 2: ALOKASI RUTIN GAJIAN */}
        {activeSection === "gajian" && (
          <section id="gajian" className="surface-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>Alokasi Rutin Gajian</span>
                  {paydayChecklist?.totalCount > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        paydayChecklist.allDone
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-accent-500/15 text-accent-200 border-accent-500/30"
                      }`}
                    >
                      {paydayChecklist.doneCount}/{paydayChecklist.totalCount} selesai
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Panduan transfer tiap gajian ({paydayChecklist?.periodShort || "Siklus Ini"} ·{" "}
                  {paydayChecklist?.periodRange || "-"}). Centang agar saldo dompet otomatis berpindah.
                </p>
              </div>
              <button
                type="button"
                onClick={openPlanModal}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] text-slate-200 border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 pressable"
              >
                <Pencil className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                <span>Atur Template</span>
              </button>
            </div>

            {!paydayChecklist || paydayChecklist.items.length === 0 ? (
              <div className="p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span>
                  Belum ada template bagi gaji. Atur urutan transfer tabungan, kos, dan investasi tiap gajian.
                </span>
                <button
                  type="button"
                  onClick={openPlanModal}
                  className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] font-semibold text-xs shrink-0 pressable"
                >
                  Buat Template
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {paydayChecklist.totalCount > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Progres alokasi siklus ini</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {Math.round((paydayChecklist.doneCount / paydayChecklist.totalCount) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-inset)] overflow-hidden">
                      <div
                        style={{
                          width: `${Math.round(
                            (paydayChecklist.doneCount / paydayChecklist.totalCount) * 100
                          )}%`,
                        }}
                        className={`h-full rounded-full chart-bar-fill ${
                          paydayChecklist.allDone ? "bg-emerald-400" : "bg-accent-500"
                        }`}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
                    <div className="text-[11px] text-slate-400">Gaji Rutinan</div>
                    <div className="font-mono-num font-bold text-slate-100 mt-0.5 text-sm">
                      {formatRupiah(paydayChecklist.monthlyIncome)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
                    <div className="text-[11px] text-slate-400">Total Dialokasikan</div>
                    <div className="font-mono-num font-bold text-accent-300 mt-0.5 text-sm">
                      {formatRupiah(paydayChecklist.totalPlanned)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25">
                    <div className="text-[11px] text-emerald-300">Sisa Dana Harian</div>
                    <div className="font-mono-num font-bold text-emerald-400 mt-0.5 text-sm">
                      {formatRupiah(paydayChecklist.remainingForDaily)}
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-[var(--border-subtle)] rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] overflow-hidden">
                  {paydayChecklist.items.map((it) => (
                    <div
                      key={it.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        it.done ? "bg-emerald-500/[0.04]" : it.auto ? "bg-amber-500/[0.04]" : ""
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[13px] font-semibold ${
                              it.done ? "line-through text-slate-400" : "text-slate-100"
                            }`}
                          >
                            {it.label}
                          </span>
                          {it.type === "transfer" && it.fromWalletName && it.toWalletName && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--track-bg)] text-[11px] text-slate-300 font-medium">
                              {it.fromWalletName} → {it.toWalletName}
                            </span>
                          )}
                          {it.type === "bill" && it.fromWalletName && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--track-bg)] text-[11px] text-slate-300 font-medium">
                              via {it.fromWalletName}
                            </span>
                          )}
                          {it.auto && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-semibold">
                              Tagihan Berjalan
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono-num font-bold text-slate-200">
                            {formatRupiah(it.amount)}
                          </span>
                          {it.note && <span className="text-slate-400">· {it.note}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {it.done ? (
                          <>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Selesai</span>
                            </span>
                            {!it.auto && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleUncheckPaydayStep(it.id)}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-50 px-2 py-1"
                              >
                                {actionLoading && <Spinner className="w-3 h-3" />}
                                <span>Batal</span>
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleCompletePaydayStep(it.id, true)}
                              className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 disabled:opacity-50 text-accent-200 border border-accent-500/35 text-[11px] font-semibold pressable"
                            >
                              {actionLoading ? (
                                <Spinner className="w-3 h-3" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              <span>{it.type === "bill" ? "Bayar & Centang" : "Transfer & Centang"}</span>
                            </button>
                            {!it.auto && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleCompletePaydayStep(it.id, false)}
                                title="Tandai selesai tanpa ubah saldo dompet"
                                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 text-slate-300 border border-[var(--border-subtle)] text-[11px] font-medium pressable"
                              >
                                Centang saja
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {paydayChecklist.nearestWishlist && (
                  <div className="pt-1 flex items-center justify-between gap-2 flex-wrap text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                      <span>
                        Wishlist terdekat:{" "}
                        <strong className="text-slate-200">{paydayChecklist.nearestWishlist.name}</strong> (
                        <span className="font-mono-num text-accent-300">
                          {formatRupiah(paydayChecklist.nearestWishlist.price)}
                        </span>
                        )
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSection("wishlist")}
                      className="text-accent-300 hover:text-accent-200 font-semibold"
                    >
                      Buka Wishlist →
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: TAGIHAN TETAP & UTANG/PIUTANG */}
        {activeSection === "tagihan" && (
          <div className="space-y-5">
            <section id="tagihan" className="surface-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    <span>Tagihan Tetap & Jadwal Reminder</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Pengingat Telegram dikirim otomatis tiap pagi menjelang jatuh tempo.
                  </p>
                </div>
                <Link
                  href="/atur"
                  className="text-xs text-accent-300 hover:text-accent-200 font-medium shrink-0"
                >
                  Edit di Atur
                </Link>
              </div>

              {upcomingBills.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Belum ada tagihan tetap. Tambahkan di halaman{" "}
                  <Link href="/atur" className="text-accent-300 underline">
                    Atur
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upcomingBills.map((b) => (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                        b.paidInCurrentCycle
                          ? "bg-emerald-500/[0.06] border-emerald-500/25"
                          : b.urgency === "OVERDUE" || b.urgency === "TODAY"
                          ? "bg-rose-500/[0.06] border-rose-500/30"
                          : b.urgency === "SOON"
                          ? "bg-amber-500/[0.06] border-amber-500/30"
                          : "bg-[var(--bg-inset)] border-[var(--border-subtle)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100 truncate">{b.name}</span>
                          {b.paidInCurrentCycle && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-300">
                              <Check className="w-3 h-3" aria-hidden="true" />
                              <span>Sudah Dibayar{b.lastPaidLabel ? ` (${b.lastPaidLabel})` : ""}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono-num font-semibold text-slate-200">
                            {b.amount > 0 ? `${formatRupiah(b.amount)}/bln` : "Lunas"}
                          </span>
                          {b.nextDueDate && (
                            <>
                              <span>·</span>
                              <span>Jatuh tempo {b.nextDueDate}</span>
                            </>
                          )}
                          {!b.paidInCurrentCycle && b.lastPaidLabel && (
                            <>
                              <span>·</span>
                              <span>Terakhir bayar {b.lastPaidLabel}</span>
                            </>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              b.paidInCurrentCycle
                                ? "bg-emerald-500/15 text-emerald-300"
                                : b.urgency === "OVERDUE" || b.urgency === "TODAY"
                                ? "bg-rose-500/20 text-rose-300"
                                : b.urgency === "SOON"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-[var(--track-bg)] text-slate-300"
                            }`}
                          >
                            {b.dueLabel}
                          </span>
                        </div>
                      </div>

                      {b.amount > 0 && b.urgency !== "INACTIVE" && (
                        b.paidInCurrentCycle ? (
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                              <Check className="w-3 h-3" aria-hidden="true" />
                              <span>Lunas</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPayBillTarget(b);
                                setPayBillAmount(String(b.dueAmount || b.amount));
                                setPayBillWalletId(wallets.find((w) => !w.locked && w.role !== "credit")?.id || "bni");
                              }}
                              className="text-[11px] text-slate-400 hover:text-slate-200 transition whitespace-nowrap"
                            >
                              Bayar lagi
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPayBillTarget(b);
                              setPayBillAmount(String(b.dueAmount || b.amount));
                              setPayBillWalletId(wallets.find((w) => !w.locked && w.role !== "credit")?.id || "bni");
                            }}
                            className="min-h-[34px] px-3 py-1.5 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 text-accent-200 border border-accent-500/35 text-[11px] font-semibold shrink-0 pressable"
                          >
                            Tandai Bayar
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section id="utang" className="surface-card rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>Catatan Utang & Piutang</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setDebtModalOpen(true)}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] text-slate-200 border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 pressable"
                >
                  <Plus className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                  <span>Catat Utang/Piutang</span>
                </button>
              </div>

              <div className="inline-flex items-center gap-1 bg-[var(--bg-inset)] p-1 rounded-xl border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setDebtTab("open")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    debtTab === "open"
                      ? "bg-[var(--bg-active)] text-slate-100 shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>Belum Dibayar</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--track-bg)] font-mono-num">
                    {openDebts.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDebtTab("paid")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    debtTab === "paid"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sudah Dibayar</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--track-bg)] font-mono-num">
                    {paidDebts.length}
                  </span>
                </button>
              </div>

              {debtTab === "open" ? (
                <div className="space-y-4">
                  {simplifiableGroups.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-amber-300">
                          Bisa Disederhanakan (Impas)
                        </div>
                        <div className="space-y-0.5 text-xs text-slate-200 leading-relaxed">
                          {simplifiableGroups.map((g) => (
                            <div key={g.person}>
                              {g.hasBoth ? (
                                g.net > 0 ? (
                                  <>
                                    <strong>{g.person}</strong>: Piutang {formatRupiah(g.piutangTotal)} − Utang{" "}
                                    {formatRupiah(g.utangTotal)} ={" "}
                                    <strong className="text-emerald-300">Sisa Piutang {formatRupiah(g.net)}</strong>
                                  </>
                                ) : g.net < 0 ? (
                                  <>
                                    <strong>{g.person}</strong>: Utang {formatRupiah(g.utangTotal)} − Piutang{" "}
                                    {formatRupiah(g.piutangTotal)} ={" "}
                                    <strong className="text-rose-300">Sisa Utang {formatRupiah(Math.abs(g.net))}</strong>
                                  </>
                                ) : (
                                  <>
                                    <strong>{g.person}</strong>: Piutang {formatRupiah(g.piutangTotal)} − Utang{" "}
                                    {formatRupiah(g.utangTotal)} ={" "}
                                    <strong className="text-emerald-300">Impas (Rp 0)</strong>
                                  </>
                                )
                              ) : (
                                <>
                                  <strong>{g.person}</strong>: Gabung {g.count} catatan →{" "}
                                  <strong className="text-accent-300">
                                    {g.piutangTotal > 0
                                      ? `Piutang ${formatRupiah(g.piutangTotal)}`
                                      : `Utang ${formatRupiah(g.utangTotal)}`}
                                  </strong>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSimplifyDebts}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs shrink-0 pressable"
                      >
                        {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                        <span>{actionLoading ? "Memproses..." : "Sederhanakan"}</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {
                        key: "utang",
                        title: `Utang ${userCall}`,
                        list: utangList,
                        titleClass: "text-rose-300",
                        totalClass: "text-rose-400",
                        amtClass: "text-rose-300",
                        emptyText: "Tidak ada utang yang belum dibayar.",
                      },
                      {
                        key: "piutang",
                        title: "Piutang / Uang di Orang",
                        list: piutangList,
                        titleClass: "text-emerald-300",
                        totalClass: "text-emerald-400",
                        amtClass: "text-emerald-300",
                        emptyText: "Tidak ada piutang yang belum dibayar.",
                      },
                    ].map((col) => (
                      <div key={col.key} className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs px-0.5">
                          <span className={`font-semibold ${col.titleClass}`}>
                            {col.title} ({col.list.length})
                          </span>
                          <span className={`font-mono-num font-bold ${col.totalClass}`}>
                            {formatRupiah(col.list.reduce((a, d) => a + (Number(d.amount) || 0), 0))}
                          </span>
                        </div>

                        {col.list.length === 0 ? (
                          <p className="text-xs text-slate-400 p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
                            {col.emptyText}
                          </p>
                        ) : (
                          <div className="divide-y divide-[var(--border-subtle)] rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] overflow-hidden">
                            {col.list.map((d) => (
                              <div key={d.id} className="p-3.5 space-y-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-100 text-[13px] truncate">
                                      {d.person}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className={`font-bold font-mono-num text-xs ${col.amtClass}`}>
                                        {d.amount === null ? "Nominal ?" : formatRupiah(d.amount)}
                                      </span>
                                      {d.ageDays > 0 && (
                                        <span className="text-[11px] text-slate-400">· {d.ageDays}h</span>
                                      )}
                                      {d.isSnoozed && (
                                        <span className="text-[11px] text-amber-300 font-medium">· snooze</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleSnoozeDebt(d.id)}
                                      aria-label={`Tunda pengingat ${d.person}`}
                                      title="Tunda reminder 3 hari"
                                      className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-400 hover:text-amber-300 transition"
                                    >
                                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAdjustTarget(d);
                                        setAdjustMode("sub");
                                        setAdjustAmount("");
                                        setAdjustReason("");
                                      }}
                                      aria-label={`Sesuaikan nominal ${d.person}`}
                                      title="Kurangi / Tambah nominal"
                                      className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-300 hover:text-accent-300 transition"
                                    >
                                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSettleTarget(d);
                                        setSettleAmount(d.amount ? String(d.amount) : "");
                                        setSettleWalletId(
                                          wallets.find((w) => !w.locked && w.role !== "credit")?.id || "bni"
                                        );
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-500/15 hover:bg-accent-500/25 text-accent-200 border border-accent-500/30 text-[11px] font-semibold pressable"
                                    >
                                      <CheckCircle className="w-3 h-3" aria-hidden="true" />
                                      <span>Lunas</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDebt(d.id)}
                                      aria-label={`Hapus catatan ${d.person}`}
                                      title="Hapus catatan"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>
                                {d.note && (
                                  <p className="text-[11px] text-slate-300 leading-relaxed break-words">
                                    {d.note}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      key: "paid-utang",
                      title: "Utang Sudah Dibayar",
                      list: paidUtangList,
                      emptyText: "Belum ada riwayat utang yang sudah dibayar.",
                    },
                    {
                      key: "paid-piutang",
                      title: "Piutang Sudah Dibayar",
                      list: paidPiutangList,
                      emptyText: "Belum ada riwayat piutang yang sudah dibayar.",
                    },
                  ].map((col) => (
                    <div key={col.key} className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs px-0.5">
                        <span className="font-semibold text-slate-200">
                          {col.title} ({col.list.length})
                        </span>
                        <span className="font-mono-num text-slate-200 font-bold">
                          {formatRupiah(col.list.reduce((a, d) => a + (Number(d.amount) || 0), 0))}
                        </span>
                      </div>

                      {col.list.length === 0 ? (
                        <p className="text-xs text-slate-400 p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
                          {col.emptyText}
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--border-subtle)] rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] overflow-hidden">
                          {col.list.map((d) => {
                            const wName = d.targetWalletId
                              ? wallets.find((w) => w.id === d.targetWalletId)?.name
                              : "";
                            return (
                              <div key={d.id} className="p-3.5 space-y-1.5 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-100 text-[13px] truncate">
                                      {d.person}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                                      <span className="font-semibold font-mono-num text-slate-200">
                                        {d.amount === null ? "Nominal ?" : formatRupiah(d.amount)}
                                      </span>
                                      {d.paidAt && <span>· {formatShortDate(d.paidAt, false)}</span>}
                                      {wName && <span>· {wName}</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold">
                                      <CheckCircle className="w-3 h-3" aria-hidden="true" />
                                      <span>Lunas</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDebt(d.id)}
                                      aria-label={`Hapus riwayat ${d.person}`}
                                      title="Hapus riwayat"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>
                                {d.note && (
                                  <p className="text-[11px] text-slate-400 leading-relaxed break-words">
                                    {d.note}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 4: CICILAN BERJANGKA (NOTE: exact string "Piutang Cicilan" kept solely on the tab button for E2E strict selector) */}
        {activeSection === "cicilan" && (
          <section id="cicilan" className="surface-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>Cicilan Berjangka</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Terpisah dari utang harian · jatuh tempo bulanan otomatis diingatkan di Telegram
                </p>
              </div>
              <div className="flex items-center gap-2">
                {totalInstallmentRemaining > 0 && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono-num bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Sisa: {formatRupiah(totalInstallmentRemaining)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={openNewInstModal}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] text-slate-200 border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 pressable"
                >
                  <Plus className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                  <span>Tambah Cicilan</span>
                </button>
              </div>
            </div>

            <div className="inline-flex items-center gap-1 bg-[var(--bg-inset)] p-1 rounded-xl border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setInstTab("active")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  instTab === "active"
                    ? "bg-[var(--bg-active)] text-slate-100 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Berjalan</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--track-bg)] font-mono-num">
                  {activeInstallments.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setInstTab("paid")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  instTab === "paid"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lunas</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--track-bg)] font-mono-num">
                  {paidInstallments.length}
                </span>
              </button>
            </div>

            {instTab === "active" ? (
              activeInstallments.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">
                  Belum ada cicilan berjangka yang sedang berjalan.
                </p>
              ) : (
                <div className="space-y-3">
                  {activeInstallments.map((inst) => {
                    const totalAmt = Number(inst.totalAmount) || 0;
                    const paidAmt = Number(inst.paidAmount) || 0;
                    const remaining = Math.max(0, totalAmt - paidAmt);
                    const pct = totalAmt > 0 ? Math.min(100, Math.round((paidAmt / totalAmt) * 100)) : 0;
                    const targetW = wallets.find((w) => w.id === inst.targetWalletId);
                    const lastHist =
                      Array.isArray(inst.history) && inst.history.length > 0
                        ? inst.history[inst.history.length - 1]
                        : null;
                    const urgencyClass =
                      inst.urgency === "OVERDUE" || inst.urgency === "TODAY"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        : inst.urgency === "SOON"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : "bg-[var(--track-bg)] text-slate-300 border-[var(--border-default)]";

                    return (
                      <div
                        key={inst.id}
                        className="p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-3 text-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-100">
                                {inst.label || `Cicilan ${inst.person}`}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-accent-500/15 text-accent-200 border border-accent-500/30 text-[11px] font-semibold">
                                {inst.person}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${urgencyClass}`}>
                                Tgl {inst.dueDay} {inst.dueLabel ? `· ${inst.dueLabel}` : ""}
                              </span>
                              {targetW && (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--track-bg)] text-slate-300 text-[11px] font-medium">
                                  → {targetW.name}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-300">
                              <span>
                                Cicilan:{" "}
                                <strong className="font-mono-num text-emerald-400">
                                  {formatRupiah(inst.monthlyAmount)}/bln
                                </strong>
                              </span>
                              <span className="text-slate-600">·</span>
                              <span>
                                Sisa:{" "}
                                <strong className="font-mono-num text-slate-100">
                                  {formatRupiah(remaining)}
                                </strong>{" "}
                                <span className="text-slate-400">/ {formatRupiah(totalAmt)}</span>
                              </span>
                              {inst.nextDueDate && (
                                <>
                                  <span className="text-slate-600">·</span>
                                  <span className="text-slate-400">Jatuh tempo {inst.nextDueDate}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openPayInstModal(inst)}
                              className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 text-accent-200 border border-accent-500/35 text-xs font-semibold pressable"
                            >
                              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Terima Cicilan</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditInstModal(inst)}
                              aria-label={`Edit cicilan ${inst.label || inst.person}`}
                              title="Edit cicilan"
                              className="p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-300 hover:text-accent-300 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInstallment(inst.id)}
                              aria-label={`Hapus cicilan ${inst.label || inst.person}`}
                              title="Hapus cicilan"
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              Progress:{" "}
                              <strong className="text-slate-200 font-mono-num">
                                {inst.paidCount}/{inst.totalMonths} bln
                              </strong>{" "}
                              · {pct}%
                            </span>
                            <span className="font-mono-num text-emerald-400">
                              Masuk: {formatRupiah(paidAmt)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--track-bg)] overflow-hidden">
                            <div
                              className="h-full bg-emerald-400 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {(inst.note || lastHist) && (
                          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                            <span>{inst.note || ""}</span>
                            {lastHist && (
                              <span className="text-emerald-300 font-mono-num">
                                Terakhir masuk {formatShortDate(lastHist.paidAt, false)}: +
                                {formatRupiah(lastHist.amount)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : paidInstallments.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">Belum ada cicilan berjangka yang lunas.</p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] overflow-hidden">
                {paidInstallments.map((inst) => (
                  <div
                    key={inst.id}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-100">
                        {inst.label || `Cicilan ${inst.person}`} ({inst.paidCount}/{inst.totalMonths} bln)
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Total diterima:{" "}
                        <span className="font-mono-num text-emerald-300">{formatRupiah(inst.paidAmount)}</span>
                        {inst.paidAt && ` · Lunas ${formatShortDate(inst.paidAt, false)}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteInstallment(inst.id)}
                      aria-label={`Hapus riwayat ${inst.label || inst.person}`}
                      title="Hapus riwayat"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 5: DAFTAR BARANG INCARAN (NOTE: exact string "Wishlist Belanja" kept solely on the tab button for E2E strict selector) */}
        {activeSection === "wishlist" && (
          <section id="wishlist" className="surface-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-accent-300" aria-hidden="true" />
                  <span>Daftar Barang Incaran</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Pantau harga dan progres tabungan barang sebelum checkout.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {plannedWishlists.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono-num bg-accent-500/15 text-accent-200 border border-accent-500/30">
                    Total: {formatRupiah(totalWishlistPlanned)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={openNewWishModal}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] text-slate-200 border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 pressable"
                >
                  <Plus className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                  <span>Tambah Item</span>
                </button>
              </div>
            </div>

            <div className="inline-flex items-center gap-1 bg-[var(--bg-inset)] p-1 rounded-xl border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setWishlistTab("planned")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  wishlistTab === "planned"
                    ? "bg-[var(--bg-active)] text-slate-100 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Direncanakan</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--track-bg)] font-mono-num">
                  {plannedWishlists.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setWishlistTab("bought")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  wishlistTab === "bought"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sudah Dibeli</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--track-bg)] font-mono-num">
                  {boughtWishlists.length}
                </span>
              </button>
            </div>

            {wishlistTab === "planned" ? (
              plannedWishlists.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">
                  Belum ada barang incaran. Klik &ldquo;Tambah Item&rdquo; atau ketik{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--bg-inset)] text-slate-200 font-mono text-[11px]">
                    tambah wishlist ...
                  </code>{" "}
                  di Telegram.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {plannedWishlists.map((w) => {
                    const pct = w.price > 0 ? Math.min(100, Math.round(((w.saved || 0) / w.price) * 100)) : 0;
                    return (
                      <div
                        key={w.id}
                        className="p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-3 text-xs flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-100 text-[13px] truncate">
                                {w.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                  w.priority === "high"
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : w.priority === "low"
                                    ? "bg-[var(--track-bg)] text-slate-400"
                                    : "bg-accent-500/15 text-accent-200 border border-accent-500/25"
                                }`}
                              >
                                {w.priority === "high"
                                  ? "Prioritas"
                                  : w.priority === "low"
                                  ? "Santai"
                                  : "Sedang"}
                              </span>
                            </div>
                            <div className="font-mono-num font-bold text-sm text-emerald-400 mt-1">
                              {w.price > 0 ? formatRupiah(w.price) : "Harga belum diisi"}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditWishModal(w)}
                              aria-label={`Edit ${w.name}`}
                              title="Edit item"
                              className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-300 hover:text-accent-300"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBuyWishTarget(w);
                                setBuyWishAmount(w.price ? String(w.price) : "");
                                setBuyWishWalletId(
                                  wallets.find((x) => !x.locked && x.role !== "credit")?.id || "bni"
                                );
                                setBuyWishLogTx(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold pressable"
                            >
                              <CheckCircle className="w-3 h-3" aria-hidden="true" />
                              <span>Beli</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWishlist(w.id)}
                              aria-label={`Hapus ${w.name}`}
                              title="Hapus item"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {w.saved > 0 && w.price > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>Terkumpul {formatRupiah(w.saved)}</span>
                              <span className="font-mono-num text-accent-300">{pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--track-bg)] overflow-hidden">
                              <div style={{ width: `${pct}%` }} className="h-full bg-accent-500 rounded-full" />
                            </div>
                          </div>
                        )}

                        {(w.url || w.note) && (
                          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            {w.note ? <span className="text-slate-400 truncate">{w.note}</span> : <span />}
                            {w.url && /^https?:\/\//i.test(w.url) && (
                              <a
                                href={w.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-200 font-semibold shrink-0"
                              >
                                <span>Buka Link</span>
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : boughtWishlists.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">Belum ada item yang sudah dibeli.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {boughtWishlists.map((w) => (
                  <div
                    key={w.id}
                    className="p-3.5 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">{w.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono-num text-slate-200">{formatRupiah(w.price)}</span>
                        {w.boughtAt && <span>· {formatShortDate(w.boughtAt, false)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold">
                        <CheckCircle className="w-3 h-3" aria-hidden="true" />
                        <span>Dibeli</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteWishlist(w.id)}
                        aria-label={`Hapus ${w.name}`}
                        title="Hapus item"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* MODALS (Unified Shared Accessible <Modal>) */}
        <Modal
          isOpen={auditOpen}
          onClose={() => setAuditOpen(false)}
          title="Audit Saldo (Cek Surplus / Gap)"
          subtitle="Masukkan saldo aktual tiap sumber dana (isi negatif untuk tagihan PayLater, misal -500000)."
        >
          <form onSubmit={handleApplyAudit} className="space-y-3">
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {wallets
                .filter((w) => !w.locked)
                .map((w) => {
                  const val = Number(auditInputs[w.id]) || 0;
                  const diff = val - (Number(w.balance) || 0);
                  return (
                    <div
                      key={w.id}
                      className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{w.name}</span>
                        <span
                          className={`text-[11px] font-mono-num font-bold ${
                            diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {diff === 0 ? "KLOP" : `${diff > 0 ? "Surplus +" : "Gap "}${formatRupiah(diff)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 shrink-0 font-mono-num">
                          Cat: {formatRupiah(w.balance)} →
                        </span>
                        <input
                          type="number"
                          aria-label={`Saldo aktual ${w.name}`}
                          value={auditInputs[w.id] ?? ""}
                          onChange={(e) => setAuditInputs({ ...auditInputs, [w.id]: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
              <span className="text-slate-400">Total Selisih (Real - Catatan):</span>
              <span
                className={`font-bold font-mono-num ${
                  auditDiffTotal === 0
                    ? "text-slate-200"
                    : auditDiffTotal > 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {auditDiffTotal === 0
                  ? "Rp 0 (KLOP)"
                  : `${auditDiffTotal > 0 ? "+" : ""}${formatRupiah(auditDiffTotal)}`}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAuditOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyimpan..." : "Sesuaikan Saldo"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(payBillTarget)}
          onClose={() => setPayBillTarget(null)}
          title={
            payBillTarget
              ? `Bayar Tagihan: ${payBillTarget.name.split("(")[0].trim()}`
              : "Bayar Tagihan"
          }
          maxWidth="max-w-sm"
        >
          <form onSubmit={handlePayBill} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nominal Bayar (Rp)</label>
              <input
                type="number"
                required
                value={payBillAmount}
                onChange={(e) => setPayBillAmount(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Potong dari Dana</label>
              <select
                value={payBillWalletId}
                onChange={(e) => setPayBillWalletId(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              >
                {wallets
                  .filter((w) => !w.locked)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatRupiah(w.balance)})
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayBillTarget(null)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Memproses..." : "Konfirmasi Bayar"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Tambah Pos Tabungan Baru"
        >
          <form onSubmit={handleAddPot} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Pos</label>
              <input
                type="text"
                required
                placeholder="Misal: Tabungan Kos, Gadget"
                value={newPotName}
                onChange={(e) => setNewPotName(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target (Rp)</label>
                <input
                  type="number"
                  required
                  placeholder="5000000"
                  value={newPotTarget}
                  onChange={(e) => setNewPotTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Saldo Awal (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={newPotSaved}
                  onChange={(e) => setNewPotSaved(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Alokasi Bulanan (Opsional)</label>
              <input
                type="number"
                placeholder="Rp"
                value={newPotMonthly}
                onChange={(e) => setNewPotMonthly(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyimpan..." : "Simpan Pos"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(topUpPotId)}
          onClose={() => setTopUpPotId(null)}
          title={`Isi Tabungan: ${pots.find((p) => p.id === topUpPotId)?.name || ""}`}
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleTopUp} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nominal Tambahan (Rp)</label>
              <input
                type="number"
                autoFocus
                required
                placeholder="500000"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-sm text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTopUpPotId(null)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading || !topUpAmount}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyetor..." : "Setor"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={transferOpen}
          onClose={() => setTransferOpen(false)}
          title="Pindah Dana / Bayar PayLater"
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleTransfer} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Dari Dana</label>
              <select
                value={trFrom}
                onChange={(e) => setTrFrom(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatRupiah(w.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ke Dana / Bayar Tagihan</label>
              <select
                value={trTo}
                onChange={(e) => setTrTo(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatRupiah(w.balance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nominal (Rp)</label>
              <input
                type="number"
                required
                placeholder="100000"
                value={trAmount}
                onChange={(e) => setTrAmount(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Memindahkan..." : "Pindahkan"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={debtModalOpen}
          onClose={() => setDebtModalOpen(false)}
          title="Catat Utang / Piutang"
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleAddDebt} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {["utang", "piutang"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDebtType(t)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition ${
                    debtType === t
                      ? "bg-accent-500/20 text-accent-200 border-accent-500/45"
                      : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)]"
                  }`}
                >
                  {t === "utang" ? `Utang ${userCall}` : "Piutang (Di Orang)"}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              placeholder="Nama Orang / Tempat"
              value={debtPerson}
              onChange={(e) => setDebtPerson(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
            />
            <input
              type="number"
              placeholder="Nominal Rp (kosongkan jika belum jelas)"
              value={debtAmount}
              onChange={(e) => setDebtAmount(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
            />
            <input
              type="text"
              placeholder="Catatan (opsional)"
              value={debtNote}
              onChange={(e) => setDebtNote(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDebtModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyimpan..." : "Simpan"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(settleTarget)}
          onClose={() => setSettleTarget(null)}
          title={
            settleTarget
              ? `${settleTarget.type === "piutang" ? "Terima Pembayaran Piutang" : "Bayar Utang"}: ${
                  settleTarget.person
                }`
              : ""
          }
          maxWidth="max-w-sm"
        >
          {settleTarget && (
            <form onSubmit={handleSettleDebt} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nominal (Rp)</label>
                <input
                  type="number"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
              {wallets.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    {settleTarget.type === "piutang" ? "Masuk ke Dana" : "Bayar Pakai Dana"}
                  </label>
                  <select
                    value={settleWalletId}
                    onChange={(e) => setSettleWalletId(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                  >
                    {wallets
                      .filter((w) => !w.locked && (settleTarget.type !== "piutang" || w.role !== "credit"))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({formatRupiah(w.balance)})
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {settleTarget.amount > 0 &&
                Number(settleAmount) > 0 &&
                Number(settleAmount) < Number(settleTarget.amount) && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs font-medium text-amber-200">
                    Cicilan sebagian: sisa{" "}
                    <span className="font-mono-num font-bold">
                      {formatRupiah(Number(settleTarget.amount) - Number(settleAmount))}
                    </span>{" "}
                    tetap di Belum Dibayar.
                  </div>
                )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleTarget(null)}
                  className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs flex items-center gap-1.5 pressable"
                >
                  {actionLoading ? (
                    <Spinner className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {actionLoading
                      ? "Memproses..."
                      : settleTarget.amount > 0 &&
                        Number(settleAmount) > 0 &&
                        Number(settleAmount) < Number(settleTarget.amount)
                      ? "Catat Cicilan"
                      : "Konfirmasi Lunas"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </Modal>

        <Modal
          isOpen={Boolean(adjustTarget)}
          onClose={() => setAdjustTarget(null)}
          title={
            adjustTarget
              ? `Sesuaikan ${adjustTarget.type === "piutang" ? "Piutang" : "Utang"}: ${
                  adjustTarget.person
                }`
              : ""
          }
          subtitle={
            adjustTarget
              ? `Nominal saat ini: ${formatRupiah(Number(adjustTarget.amount) || 0)}`
              : ""
          }
          maxWidth="max-w-sm"
        >
          {adjustTarget && (() => {
            const prev = Number(adjustTarget.amount) || 0;
            const amtNum = Number(adjustAmount) || 0;
            const signedDelta = (adjustMode === "sub" ? -1 : 1) * amtNum;
            const nextSigned = prev + signedDelta;
            const curLabel = adjustTarget.type === "piutang" ? "Piutang" : "Utang";
            const flippedLabel = adjustTarget.type === "piutang" ? "Utang" : "Piutang";
            return (
              <form onSubmit={handleAdjustDebt} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "sub", label: "− Kurangi" },
                    { id: "add", label: "+ Tambah" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAdjustMode(m.id)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition ${
                        adjustMode === m.id
                          ? m.id === "sub"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-accent-500/20 text-accent-200 border-accent-500/40"
                          : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nominal (Rp)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    autoFocus
                    placeholder="Misal: 79000"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Catatan / Alasan (opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: bayar sebagian"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                  />
                </div>
                {amtNum > 0 && (
                  <div className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-xs font-semibold text-slate-100">
                    {formatRupiah(prev)} {adjustMode === "sub" ? "−" : "+"} {formatRupiah(amtNum)} ={" "}
                    {nextSigned === 0 ? (
                      <span className="text-emerald-400 font-bold">Impas (Rp 0, Lunas)</span>
                    ) : nextSigned > 0 ? (
                      <span className="text-accent-300 font-bold">
                        Sisa {curLabel} {formatRupiah(nextSigned)}
                      </span>
                    ) : (
                      <span className="text-amber-300 font-bold">
                        Berbalik jadi {flippedLabel} {formatRupiah(Math.abs(nextSigned))}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAdjustTarget(null)}
                    className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || amtNum <= 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
                  >
                    {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                    <span>{actionLoading ? "Menyimpan..." : "Simpan Perubahan"}</span>
                  </button>
                </div>
              </form>
            );
          })()}
        </Modal>

        <Modal
          isOpen={wishModalOpen}
          onClose={() => setWishModalOpen(false)}
          title={editingWish ? "Edit Barang Incaran" : "Tambah Barang Incaran"}
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleSaveWishlist} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama Barang</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="Misal: Keyboard Mechanical"
                value={wishName}
                onChange={(e) => setWishName(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Harga (Rp)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="1500000"
                  value={wishPrice}
                  onChange={(e) => setWishPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sudah Terkumpul</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={wishSaved}
                  onChange={(e) => setWishSaved(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Prioritas</label>
              <select
                value={wishPriority}
                onChange={(e) => setWishPriority(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              >
                <option value="high">Prioritas Tinggi</option>
                <option value="medium">Sedang</option>
                <option value="low">Santai</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Link Produk (opsional)</label>
              <input
                type="url"
                placeholder="https://..."
                value={wishUrl}
                onChange={(e) => setWishUrl(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Catatan (opsional)</label>
              <input
                type="text"
                placeholder="Misal: tunggu promo gajian"
                value={wishNote}
                onChange={(e) => setWishNote(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWishModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyimpan..." : "Simpan Item"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(buyWishTarget)}
          onClose={() => setBuyWishTarget(null)}
          title={buyWishTarget ? `Beli Item: ${buyWishTarget.name}` : ""}
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleBuyWishlist} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nominal Beli (Rp)</label>
              <input
                type="number"
                min="1"
                required
                value={buyWishAmount}
                onChange={(e) => setBuyWishAmount(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={buyWishLogTx}
                onChange={(e) => setBuyWishLogTx(e.target.checked)}
                className="rounded border-[var(--border-default)] bg-[var(--bg-inset)]"
              />
              <span>Catat pengeluaran &amp; potong saldo dompet</span>
            </label>
            {buyWishLogTx && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Pakai Sumber Dana</label>
                <select
                  value={buyWishWalletId}
                  onChange={(e) => setBuyWishWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                >
                  {wallets
                    .filter((w) => !w.locked)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatRupiah(w.balance)})
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBuyWishTarget(null)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs flex items-center gap-1.5 pressable"
              >
                {actionLoading ? (
                  <Spinner className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{actionLoading ? "Memproses..." : "Konfirmasi Dibeli"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={planModalOpen}
          onClose={() => setPlanModalOpen(false)}
          title="Template Alokasi Gajian"
          subtitle={`Total alokasi: ${formatRupiah(
            planDraft.reduce((a, x) => a + (Number(x.amount) || 0), 0)
          )} · Sisa harian: ${formatRupiah(
            Math.max(
              0,
              (Number(data?.profile?.monthlyIncome) || 0) -
                planDraft.reduce((a, x) => a + (Number(x.amount) || 0), 0)
            )
          )}`}
          maxWidth="max-w-2xl"
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setPlanDraft([
                  ...planDraft,
                  {
                    id: `pd_${Date.now()}_${planDraft.length}`,
                    label: "",
                    type: "transfer",
                    amount: 0,
                    fromWalletId: "bni",
                    toWalletId: "saqu",
                    billId: "",
                    note: "",
                  },
                ])
              }
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] border border-[var(--border-default)] text-slate-200 text-xs font-semibold pressable"
            >
              + Tambah Baris
            </button>
          </div>

          <form onSubmit={handleSavePaydayPlan} className="space-y-3">
            <div className="space-y-2.5">
              {planDraft.map((row, idx) => (
                <div
                  key={row.id || idx}
                  className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-2 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Nama pos (mis. Dana Darurat)"
                      value={row.label}
                      onChange={(e) => {
                        const next = [...planDraft];
                        next[idx] = { ...row, label: e.target.value };
                        setPlanDraft(next);
                      }}
                      className="sm:col-span-5 px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-100"
                    />
                    <select
                      value={row.type}
                      onChange={(e) => {
                        const next = [...planDraft];
                        next[idx] = { ...row, type: e.target.value };
                        setPlanDraft(next);
                      }}
                      className="sm:col-span-3 px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-100"
                    >
                      <option value="transfer">Transfer Dompet</option>
                      <option value="bill">Bayar Tagihan</option>
                      <option value="note">Catatan Saja</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      placeholder="Nominal"
                      value={row.amount}
                      onChange={(e) => {
                        const next = [...planDraft];
                        next[idx] = { ...row, amount: Number(e.target.value) || 0 };
                        setPlanDraft(next);
                      }}
                      className="sm:col-span-3 px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-100 font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => setPlanDraft(planDraft.filter((_, i) => i !== idx))}
                      aria-label="Hapus baris"
                      className="sm:col-span-1 p-1.5 text-slate-400 hover:text-rose-300 flex items-center justify-center"
                      title="Hapus baris"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={row.fromWalletId || ""}
                      onChange={(e) => {
                        const next = [...planDraft];
                        next[idx] = { ...row, fromWalletId: e.target.value };
                        setPlanDraft(next);
                      }}
                      className="px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-200 text-xs"
                    >
                      <option value="">Dari: (opsional)</option>
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          Dari: {w.name}
                        </option>
                      ))}
                    </select>

                    {row.type === "bill" ? (
                      <select
                        value={row.billId || ""}
                        onChange={(e) => {
                          const next = [...planDraft];
                          next[idx] = { ...row, billId: e.target.value };
                          setPlanDraft(next);
                        }}
                        className="px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-200 text-xs"
                      >
                        <option value="">Pilih Tagihan</option>
                        {(data?.profile?.fixedCosts || []).map((fc) => (
                          <option key={fc.id} value={fc.id}>
                            {fc.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={row.toWalletId || ""}
                        onChange={(e) => {
                          const next = [...planDraft];
                          next[idx] = { ...row, toWalletId: e.target.value };
                          setPlanDraft(next);
                        }}
                        className="px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-200 text-xs"
                      >
                        <option value="">Ke: (opsional)</option>
                        {wallets.map((w) => (
                          <option key={w.id} value={w.id}>
                            Ke: {w.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      placeholder="Catatan singkat"
                      value={row.note || ""}
                      onChange={(e) => {
                        const next = [...planDraft];
                        next[idx] = { ...row, note: e.target.value };
                        setPlanDraft(next);
                      }}
                      className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg text-slate-200 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPlanModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyimpan..." : "Simpan Template"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={instModalOpen}
          onClose={() => setInstModalOpen(false)}
          title={editingInst ? "Edit Cicilan Berjangka" : "Tambah Cicilan Berjangka"}
        >
          <form onSubmit={handleSaveInstallment} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nama Orang</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Budi"
                  value={instPerson}
                  onChange={(e) => setInstPerson(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Label Cicilan</label>
                <input
                  type="text"
                  placeholder="Cicilan Laptop"
                  value={instLabel}
                  onChange={(e) => setInstLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Total Pokok (Rp)</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="10000000"
                  value={instTotal}
                  onChange={(e) => setInstTotal(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cicilan / Bulan (Rp)</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="1000000"
                  value={instMonthly}
                  onChange={(e) => setInstMonthly(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tanggal Jatuh Tempo (1-28)</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  required
                  value={instDueDay}
                  onChange={(e) => setInstDueDay(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Masuk ke Dompet</label>
                <select
                  value={instTargetWalletId}
                  onChange={(e) => setInstTargetWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                >
                  <option value="">Pilih Dompet Tujuan</option>
                  {wallets
                    .filter((w) => !w.locked && w.role !== "credit")
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Catatan (opsional)</label>
              <input
                type="text"
                placeholder="Misal: Rencana untuk RDPU/DCA"
                value={instNote}
                onChange={(e) => setInstNote(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInstModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
              >
                {actionLoading && <Spinner className="w-3.5 h-3.5" />}
                <span>{actionLoading ? "Menyimpan..." : "Simpan Cicilan"}</span>
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(payInstTarget)}
          onClose={() => setPayInstTarget(null)}
          title={
            payInstTarget
              ? `Terima Cicilan: ${payInstTarget.label || payInstTarget.person}`
              : ""
          }
          subtitle={
            payInstTarget
              ? `Progress saat ini: ${payInstTarget.paidCount}/${payInstTarget.totalMonths} bln`
              : ""
          }
          maxWidth="max-w-sm"
        >
          {payInstTarget && (
            <form onSubmit={handlePayInstallment} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nominal Diterima (Rp)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={payInstAmount}
                  onChange={(e) => setPayInstAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 font-mono-num focus:outline-none focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Masuk ke Sumber Dana</label>
                <select
                  value={payInstWalletId}
                  onChange={(e) => setPayInstWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                >
                  {wallets
                    .filter((w) => !w.locked && w.role !== "credit")
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatRupiah(w.balance)})
                      </option>
                    ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={payInstLogTx}
                  onChange={(e) => setPayInstLogTx(e.target.checked)}
                  className="rounded border-[var(--border-default)] bg-[var(--bg-inset)]"
                />
                <span>Catat pemasukan &amp; tambah saldo dompet</span>
              </label>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Catatan (opsional)</label>
                <input
                  type="text"
                  placeholder="Misal: Cicilan bulan Nov"
                  value={payInstNote}
                  onChange={(e) => setPayInstNote(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayInstTarget(null)}
                  className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs pressable"
                >
                  {actionLoading ? (
                    <Spinner className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{actionLoading ? "Memproses..." : "Catat Cicilan Masuk"}</span>
                </button>
              </div>
            </form>
          )}
        </Modal>
      </main>

      <QuickLogModal
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => reload()}
        wallets={wallets}
        agentName={agent.name}
      />
    </div>
  );
}
