"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah } from "@/lib/format";
import {
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  Sparkles,
  CheckCircle,
  Wallet,
  ArrowLeftRight,
  Lock,
  Receipt,
  ChevronRight,
  Bell,
  Scale,
  Clock,
  CreditCard,
} from "lucide-react";

export default function TabunganPage() {
  const { data, loading, reload } = useDiabloData();
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  // Modal Tambah Pos Tabungan
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [newPotTarget, setNewPotTarget] = useState("");
  const [newPotSaved, setNewPotSaved] = useState("");
  const [newPotMonthly, setNewPotMonthly] = useState("");

  // Modal Top up Pos
  const [topUpPotId, setTopUpPotId] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");

  // Modal Transfer Antar Dompet / Bayar SPayLater
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

  const [actionLoading, setActionLoading] = useState(false);

  const wallets = data?.profile?.wallets || [];
  const pots = data?.profile?.savingsPots || [];
  const reminders = data?.analytics?.reminders;
  const upcomingBills = reminders?.upcomingBills || [];
  const debts = reminders?.openDebts || (data?.profile?.debts || []).filter((d) => d.status !== "paid");
  const utangList = debts.filter((d) => d.type === "utang");
  const piutangList = debts.filter((d) => d.type === "piutang");

  const totalSaved = pots.reduce((acc, p) => acc + (Number(p.saved) || 0), 0);
  const totalTarget = pots.reduce((acc, p) => acc + (Number(p.target) || 0), 0);
  const totalProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

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

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-accent-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const auditDiffTotal = wallets
    .filter((w) => !w.locked)
    .reduce((acc, w) => acc + ((Number(auditInputs[w.id]) || 0) - (Number(w.balance) || 0)), 0);

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} profile={data?.profile} onQuickLog={() => setQuickLogOpen(true)} />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Pos Tabungan Fleksibel
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Sumber Dana, Audit Surplus/Gap, Reminder Tagihan Tetap, dan Utang / Piutang
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {wallets.length > 0 && (
              <button
                onClick={openAuditModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700"
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Audit Saldo</span>
              </button>
            )}
            {wallets.length >= 2 && (
              <button
                onClick={() => {
                  setTrFrom(wallets[0]?.id || "");
                  setTrTo(wallets[1]?.id || "");
                  setTransferOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-accent-300" />
                <span>Pindah / Bayar PL</span>
              </button>
            )}
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition shadow-lg shadow-accent-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pos</span>
            </button>
          </div>
        </div>

        {/* SUMBER DANA / DOMPET */}
        {wallets.length > 0 && (
          <section className="bento-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-accent-300" />
                <span>Sumber Dana & PayLater</span>
              </h2>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                Bersih: {formatRupiah(data?.analytics?.walletSummary?.netWorthTotal ?? 0)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {wallets.map((w) => {
                const isCredit = w.role === "credit";
                const hasDebt = isCredit && w.balance < 0;
                return (
                  <Link
                    key={w.id}
                    href={`/riwayat?wallet=${encodeURIComponent(w.id)}`}
                    className={`p-4 rounded-xl border transition flex items-center justify-between group ${
                      hasDebt
                        ? "bg-rose-500/[0.06] border-rose-500/30 hover:border-rose-400/50"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-200">{w.name}</span>
                        {w.locked && <Lock className="w-3 h-3 text-amber-400" />}
                        {isCredit && <CreditCard className="w-3 h-3 text-rose-400" />}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
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
                    <div className="text-right flex items-center gap-1.5">
                      <span
                        className={`text-sm font-bold font-mono-num ${
                          hasDebt ? "text-rose-400" : w.locked ? "text-amber-300" : "text-emerald-400"
                        }`}
                      >
                        {formatRupiah(w.balance)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* TAGIHAN TETAP & REMINDER JADWAL */}
        <section id="tagihan" className="bento-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>Tagihan Tetap & Jadwal Reminder</span>
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Otomatis kirim pengingat ke Telegram tiap pagi jika ada tagihan dekat jatuh tempo atau utang macet
              </p>
            </div>
            <Link href="/atur" className="text-[11px] text-accent-300 hover:text-accent-200 font-semibold">
              Edit di Atur →
            </Link>
          </div>

          {upcomingBills.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada tagihan tetap. Tambahkan di halaman Atur.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upcomingBills.map((b) => (
                <div
                  key={b.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    b.urgency === "OVERDUE" || b.urgency === "TODAY"
                      ? "bg-rose-500/[0.06] border-rose-500/30"
                      : b.urgency === "SOON"
                      ? "bg-amber-500/[0.06] border-amber-500/30"
                      : "bg-slate-900/60 border-slate-800"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{b.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-semibold text-slate-200">
                        {b.amount > 0 ? `${formatRupiah(b.amount)}/bln` : "Lunas"}
                      </span>
                      {b.nextDueDate && (
                        <>
                          <span>•</span>
                          <span>Jatuh tempo {b.nextDueDate}</span>
                        </>
                      )}
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          b.urgency === "OVERDUE" || b.urgency === "TODAY"
                            ? "bg-rose-500/20 text-rose-300"
                            : b.urgency === "SOON"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {b.dueLabel}
                      </span>
                    </div>
                  </div>
                  {b.amount > 0 && b.urgency !== "INACTIVE" && (
                    <button
                      onClick={() => {
                        setPayBillTarget(b);
                        setPayBillAmount(String(b.dueAmount || b.amount));
                        setPayBillWalletId(wallets.find((w) => !w.locked && w.role !== "credit")?.id || "bni");
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 border border-accent-500/30 text-[10px] font-semibold shrink-0 transition"
                    >
                      Tandai Bayar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* UTANG & PIUTANG */}
        <section id="utang" className="bento-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Catatan Utang & Piutang</span>
            </h2>
            <button
              onClick={() => setDebtModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-accent-300" />
              Catat Utang/Piutang
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Utang */}
            <div className="p-4 rounded-xl bg-rose-500/[0.04] border border-rose-500/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-300">Utang Tuan ({utangList.length})</span>
                <span className="font-mono text-rose-400 font-bold">
                  {formatRupiah(utangList.reduce((a, d) => a + (Number(d.amount) || 0), 0))}
                </span>
              </div>
              {utangList.length === 0 ? (
                <p className="text-[11px] text-slate-500">Tidak ada utang terbuka.</p>
              ) : (
                <div className="space-y-2">
                  {utangList.map((d) => (
                    <div key={d.id} className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200 truncate">{d.person}</div>
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1">
                          <span>{d.amount === null ? "Nominal ?" : formatRupiah(d.amount)}</span>
                          {d.ageDays > 0 && <span>• {d.ageDays}h</span>}
                          {d.isSnoozed && <span className="text-amber-400">• snooze</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleSnoozeDebt(d.id)}
                          title="Tunda reminder 3 hari"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300"
                        >
                          <Clock className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            setSettleTarget(d);
                            setSettleAmount(d.amount ? String(d.amount) : "");
                            setSettleWalletId(wallets.find((w) => !w.locked && w.role !== "credit")?.id || "bni");
                          }}
                          className="px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-semibold"
                        >
                          Lunas
                        </button>
                        <button onClick={() => handleDeleteDebt(d.id)} className="p-1 text-slate-500 hover:text-rose-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Piutang */}
            <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-300">Piutang / Uang di Orang ({piutangList.length})</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {formatRupiah(piutangList.reduce((a, d) => a + (Number(d.amount) || 0), 0))}
                </span>
              </div>
              {piutangList.length === 0 ? (
                <p className="text-[11px] text-slate-500">Tidak ada piutang terbuka.</p>
              ) : (
                <div className="space-y-2">
                  {piutangList.map((d) => (
                    <div key={d.id} className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200 truncate">{d.person}</div>
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1">
                          <span>{d.amount === null ? "Nominal ?" : formatRupiah(d.amount)}</span>
                          {d.ageDays > 0 && <span>• {d.ageDays}h</span>}
                          {d.isSnoozed && <span className="text-amber-400">• snooze</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleSnoozeDebt(d.id)}
                          title="Tunda reminder 3 hari"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300"
                        >
                          <Clock className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            setSettleTarget(d);
                            setSettleAmount(d.amount ? String(d.amount) : "");
                            setSettleWalletId(wallets.find((w) => !w.locked && w.role !== "credit")?.id || "bni");
                          }}
                          className="px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-semibold"
                        >
                          Dibayar
                        </button>
                        <button onClick={() => handleDeleteDebt(d.id)} className="p-1 text-slate-500 hover:text-rose-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Hero Card: Total Pos Tabungan */}
        <section className="bento-card rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Pos Tabungan
            </span>
            <span className="text-xs font-bold text-accent-300">{totalProgress}% dari Target</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div className="text-3xl sm:text-4xl font-extrabold font-heading text-emerald-400">
              {formatRupiah(totalSaved)}
            </div>
            <div className="text-xs text-slate-400">
              Target akumulasi: <strong className="text-slate-200">{formatRupiah(totalTarget)}</strong>
            </div>
          </div>

          <div className="w-full h-3 bg-slate-950/70 border border-slate-800/60 rounded-full overflow-hidden p-0.5">
            <div className="h-full bg-gradient-to-r from-accent-500 to-accent-300 rounded-full transition-all duration-500" style={{ width: `${totalProgress}%` }} />
          </div>
        </section>

        {/* Telegram Shortcut Hint */}
        <div className="p-3.5 rounded-2xl bg-accent-500/10 border border-accent-500/25 flex items-center gap-3 text-xs text-accent-200">
          <Sparkles className="w-4 h-4 text-accent-300 shrink-0" />
          <span>
            <strong>Tips Bot:</strong> Ketik <code className="font-mono">/reminder</code> untuk cek tagihan & utang macet, <code className="font-mono">/saldo</code> untuk cek surplus, atau <code className="font-mono">audit bni 35k cash 273k</code> untuk cek gap instan.
          </span>
        </div>

        {/* List of Pots */}
        <section className="space-y-4">
          {pots.length === 0 ? (
            <div className="bento-card rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <PiggyBank className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Belum Ada Pos Tabungan</h3>
              <button onClick={() => setIsAddOpen(true)} className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">
                <Plus className="w-4 h-4" /> Tambah Pos Sekarang
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pots.map((pot) => {
                const target = Number(pot.target) || 0;
                const saved = Number(pot.saved) || 0;
                const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

                return (
                  <div key={pot.id} className="bento-card rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-100 text-sm">{pot.name}</h3>
                        <button onClick={() => handleDeletePot(pot.id)} title="Hapus Pos" className="text-slate-500 hover:text-rose-400 p-1 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="mt-4 flex items-baseline justify-between text-xs">
                        <span className="text-base font-bold font-heading text-emerald-400">{formatRupiah(saved)}</span>
                        <span className="text-slate-400 text-[11px]">Target: {formatRupiah(target)}</span>
                      </div>
                      <div className="mt-2 w-full h-2 bg-slate-950/70 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-accent-500 to-accent-300 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 text-right text-[10px] text-slate-500 font-mono">{pct}% tercapai</div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80">
                      <button
                        onClick={() => {
                          setTopUpPotId(pot.id);
                          setTopUpAmount("");
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-accent-300" />
                        <span>+ Isi Tabungan</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* MODAL: Audit Saldo (Surplus / Gap Checker) */}
        {auditOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-md bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <div>
                <h3 className="text-sm font-semibold font-heading text-slate-100 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-400" />
                  Audit Saldo (Cek Surplus / Gap)
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Masukkan angka saldo aktual di HP Tuan (untuk tagihan SPayLater isi negatif, misal -500000).
                </p>
              </div>

              <form onSubmit={handleApplyAudit} className="space-y-3">
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {wallets
                    .filter((w) => !w.locked)
                    .map((w) => {
                      const val = Number(auditInputs[w.id]) || 0;
                      const diff = val - (Number(w.balance) || 0);
                      return (
                        <div key={w.id} className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-200">{w.name}</span>
                            <span
                              className={`text-[10px] font-mono font-bold ${
                                diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {diff === 0 ? "KLOP" : `${diff > 0 ? "Surplus +" : "Gap "}${formatRupiah(diff)}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 shrink-0">
                              Cat: {formatRupiah(w.balance)} →
                            </span>
                            <input
                              type="number"
                              value={auditInputs[w.id] ?? ""}
                              onChange={(e) => setAuditInputs({ ...auditInputs, [w.id]: e.target.value })}
                              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total Selisih (Real − Catatan):</span>
                  <span className={`font-bold font-mono ${auditDiffTotal === 0 ? "text-slate-300" : auditDiffTotal > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {auditDiffTotal === 0 ? "Rp 0 (KLOP)" : `${auditDiffTotal > 0 ? "+" : ""}${formatRupiah(auditDiffTotal)}`}
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setAuditOpen(false)} className="px-3 py-1.5 text-xs text-slate-400">
                    Tutup
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">
                    {actionLoading ? "Menyimpan..." : "Sesuaikan Saldo"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Bayar Tagihan Tetap */}
        {payBillTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">
                Bayar Tagihan: {payBillTarget.name.split("(")[0].trim()}
              </h3>
              <form onSubmit={handlePayBill} className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Nominal Bayar (Rp)</label>
                  <input
                    type="number"
                    required
                    value={payBillAmount}
                    onChange={(e) => setPayBillAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Potong dari Dana</label>
                  <select
                    value={payBillWalletId}
                    onChange={(e) => setPayBillWalletId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100"
                  >
                    {wallets.filter((w) => !w.locked).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatRupiah(w.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setPayBillTarget(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Batal
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">
                    {actionLoading ? "Memproses..." : "Konfirmasi Bayar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Tambah Pos */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-md bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">Tambah Pos Tabungan Baru</h3>
              <form onSubmit={handleAddPot} className="space-y-3">
                <input type="text" required placeholder="Nama Pos (misal: Tabungan Kos, Gadget)" value={newPotName} onChange={(e) => setNewPotName(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" required placeholder="Target (Rp)" value={newPotTarget} onChange={(e) => setNewPotTarget(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono" />
                  <input type="number" placeholder="Saldo Awal (Rp)" value={newPotSaved} onChange={(e) => setNewPotSaved(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono" />
                </div>
                <input type="number" placeholder="Alokasi Bulanan (Opsional, Rp)" value={newPotMonthly} onChange={(e) => setNewPotMonthly(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono" />
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsAddOpen(false)} className="px-3 py-1.5 text-xs text-slate-400">Batal</button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">Simpan Pos</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Top Up Pos */}
        {topUpPotId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">
                Isi Tabungan: {pots.find((p) => p.id === topUpPotId)?.name}
              </h3>
              <form onSubmit={handleTopUp} className="space-y-4">
                <input type="number" autoFocus required placeholder="Nominal Tambahan (Rp)" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 font-mono" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setTopUpPotId(null)} className="px-3 py-1.5 text-xs text-slate-400">Batal</button>
                  <button type="submit" disabled={actionLoading || !topUpAmount} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">Setor</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Transfer Antar Dompet / Bayar SPayLater */}
        {transferOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">Pindah Dana / Bayar SPayLater</h3>
              <form onSubmit={handleTransfer} className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Dari Dana</label>
                  <select value={trFrom} onChange={(e) => setTrFrom(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100">
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Ke Dana / Bayar Tagihan</label>
                  <select value={trTo} onChange={(e) => setTrTo(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100">
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
                    ))}
                  </select>
                </div>
                <input type="number" required placeholder="Nominal (Rp)" value={trAmount} onChange={(e) => setTrAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono" />
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setTransferOpen(false)} className="px-3 py-1.5 text-xs text-slate-400">Batal</button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">Pindahkan</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Tambah Utang/Piutang */}
        {debtModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">Catat Utang / Piutang</h3>
              <form onSubmit={handleAddDebt} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {["utang", "piutang"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDebtType(t)}
                      className={`py-2 rounded-xl text-xs font-semibold border ${
                        debtType === t
                          ? "bg-accent-500/20 text-accent-300 border-accent-500/40"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      {t === "utang" ? "Utang Tuan" : "Piutang (Di Orang)"}
                    </button>
                  ))}
                </div>
                <input type="text" required placeholder="Nama Orang / Tempat" value={debtPerson} onChange={(e) => setDebtPerson(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100" />
                <input type="number" placeholder="Nominal Rp (kosongkan jika belum jelas)" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono" />
                <input type="text" placeholder="Catatan (opsional)" value={debtNote} onChange={(e) => setDebtNote(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100" />
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setDebtModalOpen(false)} className="px-3 py-1.5 text-xs text-slate-400">Batal</button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs transition">Simpan</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Lunasi Utang/Piutang */}
        {settleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">
                {settleTarget.type === "piutang" ? "Terima Pembayaran Piutang" : "Bayar Utang"}: {settleTarget.person}
              </h3>
              <form onSubmit={handleSettleDebt} className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Nominal (Rp)</label>
                  <input type="number" required value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono" />
                </div>
                {wallets.length > 0 && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {settleTarget.type === "piutang" ? "Masuk ke Dana" : "Bayar Pakai Dana"}
                    </label>
                    <select value={settleWalletId} onChange={(e) => setSettleWalletId(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100">
                      {wallets.filter((w) => !w.locked && (settleTarget.type !== "piutang" || w.role !== "credit")).map((w) => (
                        <option key={w.id} value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setSettleTarget(null)} className="px-3 py-1.5 text-xs text-slate-400">Batal</button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-xs flex items-center gap-1 transition">
                    <CheckCircle className="w-3.5 h-3.5" /> Konfirmasi Lunas
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <QuickLogModal
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => reload()}
        wallets={wallets}
      />
    </div>
  );
}
