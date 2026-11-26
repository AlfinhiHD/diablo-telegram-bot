"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import DiabloAvatar from "@/components/DiabloAvatar";
import QuickLogModal from "@/components/QuickLogModal";
import { PaceRing, RoutineIcon } from "@/components/FinanceCharts";
import { PageSkeleton, Spinner } from "@/components/DiabloLoader";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, formatShortDate } from "@/lib/format";
import { listAvailablePeriods, computePeriodReport } from "@/lib/period-report";
import { normalizeAgent } from "@/lib/agent-persona";
import {
  Calendar,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Plus,
  Clock,
  Lock,
  Landmark,
  Banknote,
  Bell,
  CreditCard,
  Check,
  Trash2,
  BarChart3,
} from "lucide-react";

function getDueDayBadge(bill) {
  if (bill?.nextDueDate && /^\d{4}-\d{2}-\d{2}$/.test(bill.nextDueDate)) {
    return bill.nextDueDate.slice(8, 10);
  }
  if (bill?.dueDay) {
    return String(bill.dueDay).padStart(2, "0");
  }
  return "--";
}

export default function HomePage() {
  const { data, loading, reload } = useDiabloData();
  const [mounted, setMounted] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState("");
  const [busyTxId, setBusyTxId] = useState(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleToggleIntent(txId) {
    setBusyTxId(txId);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_intent", txId }),
      });
      if (res.ok) await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyTxId(null);
    }
  }

  async function handleDeleteTx(txId) {
    if (!confirm("Hapus transaksi ini? Saldo dompet terkait akan disesuaikan otomatis.")) return;
    setBusyTxId(txId);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_tx", txId }),
      });
      if (res.ok) await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyTxId(null);
    }
  }

  const profile = data?.profile;
  const analytics = data?.analytics;
  const transactions = data?.transactions || [];
  const periods = useMemo(
    () => listAvailablePeriods(transactions, profile?.paydayDate || 25),
    [transactions, profile?.paydayDate]
  );
  const activePeriodKey =
    selectedPeriodKey && periods.some((p) => p.key === selectedPeriodKey)
      ? selectedPeriodKey
      : periods[0]?.key || "";
  const activeReport = useMemo(
    () => computePeriodReport(profile || {}, transactions, activePeriodKey || null),
    [profile, transactions, activePeriodKey]
  );
  const recentTx = activeReport.transactions.slice(0, 6);
  const wallets = analytics?.walletSummary?.wallets || profile?.wallets || [];
  const debtsSummary = analytics?.debtsSummary;
  const reminders = analytics?.reminders;
  const surplus = analytics?.surplusSummary;
  const varAvgs = (analytics?.variableAverages || []).filter((v) => v.total > 0);
  const varCycles = Math.max(1, ...varAvgs.map((v) => v.monthsObserved || 1));
  const varMonthlyTotal = varAvgs.reduce((acc, v) => acc + (Number(v.avgMonthly) || 0), 0);

  if (!mounted || (loading && !data)) {
    return (
      <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
        <Nav />
        <PageSkeleton variant="dashboard" />
      </div>
    );
  }

  const agent = normalizeAgent(profile?.agent);
  const displayName =
    profile?.ownerName ||
    profile?.telegramName ||
    (data?.userId === "1128526190" ? "Alfin" : "Tuan");
  const isConfigured = profile && (profile.monthlyIncome > 0 || wallets.length > 0);
  const todayRemaining = analytics?.budget?.todayRemaining ?? 0;
  const safeDailySpend = analytics?.budget?.safeDailySpend ?? 0;
  const todaySpent = analytics?.budget?.todaySpent ?? 0;
  const todayIncome = analytics?.budget?.todayIncome ?? 0;
  const creditDebtTotal = analytics?.budget?.creditDebtTotal ?? 0;
  const isOverbudget = todayRemaining < 0;

  const dailyUsagePct =
    safeDailySpend > 0
      ? Math.min(100, Math.round((todaySpent / safeDailySpend) * 100))
      : isOverbudget
      ? 100
      : 0;
  const dailyExceeded = isOverbudget || (safeDailySpend > 0 && todaySpent > safeDailySpend);
  const ringTone = dailyExceeded ? "danger" : dailyUsagePct >= 75 ? "amber" : "safe";

  const upcomingActiveBills = (reminders?.upcomingBills || [])
    .filter((b) => b.amount > 0)
    .slice(0, 3);
  const openDebtItems = debtsSummary?.items || [];
  const openUtang = debtsSummary?.openUtangTotal ?? 0;
  const openPiutang = debtsSummary?.openPiutangTotal ?? 0;
  const netWorthTotal = analytics?.walletSummary?.netWorthTotal ?? 0;
  const netBarBase = Math.max(1, Math.max(0, netWorthTotal) + openUtang + openPiutang);
  const assetSharePct = Math.round((Math.max(0, netWorthTotal) / netBarBase) * 100);
  const piutangSharePct = Math.round((openPiutang / netBarBase) * 100);
  const utangSharePct = Math.max(0, 100 - assetSharePct - piutangSharePct);

  const hourlySlots = activeReport.hourlyStats?.slots || [];
  const peakSlot = activeReport.hourlyStats?.peakSlot;
  const maxSlotSpent = Math.max(1, ...hourlySlots.map((s) => Number(s.spent) || 0));
  const hasAnalyticsData =
    hourlySlots.some((s) => s.spent > 0) || varAvgs.length > 0;

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav
        userId={data?.userId}
        profile={data?.profile}
        onQuickLog={() => setQuickLogOpen(true)}
      />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5">
        {!isConfigured && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xs font-semibold text-amber-200">
                  Pundi-pundi Belum Dikonfigurasi
                </h2>
                <p className="text-xs text-amber-300 mt-0.5">
                  Atur gaji bulanan, tanggal gajian, dan pos tabungan agar jatah harian terhitung akurat.
                </p>
              </div>
            </div>
            <Link
              href="/atur"
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[var(--cta-ink)] text-xs font-semibold shrink-0 pressable"
            >
              Atur Sekarang
            </Link>
          </div>
        )}

        {/* ZONE 1: OBSIDIAN / PORCELAIN HERO VAULT */}
        <section
          data-tone={isOverbudget ? "danger" : "safe"}
          className="hero-vault rounded-2xl p-5 sm:p-7 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                Boleh Dipakai Hari Ini
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                  isOverbudget
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {isOverbudget ? "Overbudget" : "Aman"}
              </span>
              {creditDebtTotal > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-200 border border-amber-500/30">
                  Potong PayLater {formatRupiah(creditDebtTotal)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{displayName}</span>
              <span className="text-slate-600">·</span>
              <Calendar className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
              <span>
                {analytics?.cycle?.daysRemaining ?? 0} hari ke gajian (tgl{" "}
                {profile?.paydayDate || 25})
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <h1
                className={`text-4xl sm:text-5xl font-extrabold tracking-tight font-heading ${
                  isOverbudget ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {formatRupiah(todayRemaining)}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>
                  {safeDailySpend > 0
                    ? `Terpakai ${dailyUsagePct}% dari jatah harian`
                    : "Jatah harian belum diatur"}
                </span>
                {todayIncome > 0 && (
                  <span className="text-emerald-400 tabular-nums font-medium">
                    +{formatRupiah(todayIncome)} masuk hari ini
                  </span>
                )}
              </div>
            </div>

            <PaceRing
              size={84}
              strokeWidth={7}
              percent={dailyUsagePct}
              tone={ringTone}
              centerValue={`${dailyUsagePct}%`}
              centerLabel="terpakai"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <div>
              <span className="text-[11px] text-slate-400 block">Jatah normal</span>
              <strong className="text-sm font-semibold tabular-nums text-slate-100 mt-0.5 block">
                {formatRupiah(safeDailySpend)}
                <span className="text-xs font-normal text-slate-400">/hari</span>
              </strong>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Keluar hari ini</span>
              <strong className="text-sm font-semibold tabular-nums text-slate-100 mt-0.5 block">
                {formatRupiah(todaySpent)}
              </strong>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <span className="text-[11px] text-slate-400 block">Sisa siklus</span>
              <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                <strong className="text-sm font-semibold tabular-nums text-slate-100">
                  {formatRupiah(analytics?.budget?.remainingBudget ?? 0)}
                </strong>
                {surplus && (
                  <span
                    className={`text-[11px] tabular-nums font-medium ${
                      (surplus.projectedEndCycleSurplus ?? 0) >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    (proyeksi {(surplus.projectedEndCycleSurplus ?? 0) >= 0 ? "+" : ""}
                    {formatRupiah(surplus.projectedEndCycleSurplus ?? 0)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Inline Agent Note + Primary Action */}
          <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
              <DiabloAvatar className="w-7 h-7 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-accent-300">{agent.name}</span>
                  <span className="text-slate-600 text-[11px]">·</span>
                  <Link
                    href="/atur#agen"
                    className="text-[11px] font-medium text-slate-400 hover:text-accent-300 transition"
                  >
                    Atur Agen
                  </Link>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  &ldquo;{analytics?.message || "Keuangan masih aman. Pertahankan."}&rdquo;
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQuickLogOpen(true)}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] font-semibold text-xs shrink-0 btn-primary-diablo pressable"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Catat Transaksi</span>
            </button>
          </div>
        </section>

        {/* ZONE 2: TACTILE WALLET RAIL */}
        {wallets.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-100">Sumber Dana</h2>
                <span className="text-xs text-slate-400">
                  Likuid Bersih{" "}
                  <strong className="font-mono-num text-emerald-400">
                    {formatRupiah(analytics?.walletSummary?.liquidTotal ?? 0)}
                  </strong>
                </span>
              </div>
              <Link
                href="/tabungan"
                className="text-xs font-medium text-accent-300 hover:text-accent-200 flex items-center gap-0.5 shrink-0"
              >
                <span>Kelola</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {wallets.map((w) => {
                const isLocked = w.locked || w.role === "emergency";
                const isCredit = w.role === "credit";
                const isDaily = w.role === "daily";
                const hasCreditDebt = isCredit && w.balance < 0;

                const topAccentClass = hasCreditDebt
                  ? "border-t-2 border-t-rose-400/80"
                  : isCredit
                  ? "border-t-2 border-t-emerald-400/70"
                  : isLocked
                  ? "border-t-2 border-t-amber-400/75"
                  : isDaily
                  ? "border-t-2 border-t-accent-400/80"
                  : "border-t-2 border-t-slate-400/35";

                return (
                  <Link
                    key={w.id}
                    href={`/riwayat?wallet=${encodeURIComponent(w.id)}`}
                    className={`wallet-tile p-3.5 rounded-xl flex flex-col justify-between gap-2.5 pressable ${topAccentClass}`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {w.name}
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                        {isLocked ? (
                          <Lock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                        ) : isCredit ? (
                          <CreditCard
                            className={`w-3.5 h-3.5 ${
                              hasCreditDebt ? "text-rose-400" : "text-emerald-400"
                            }`}
                            aria-hidden="true"
                          />
                        ) : w.id === "cash" ? (
                          <Banknote className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Landmark className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                        )}
                      </span>
                    </div>

                    <div>
                      <div
                        className={`text-sm font-bold font-mono-num whitespace-nowrap ${
                          hasCreditDebt
                            ? "text-rose-400"
                            : isCredit
                            ? "text-emerald-400"
                            : isLocked
                            ? "text-amber-300"
                            : "text-slate-100"
                        }`}
                      >
                        {isCredit && w.balance === 0 ? "Lunas (Rp 0)" : formatRupiah(w.balance)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                        <span>
                          {isLocked
                            ? "Darurat"
                            : isCredit
                            ? hasCreditDebt
                              ? "Tagihan"
                              : "PayLater"
                            : isDaily
                            ? "Harian"
                            : "Simpanan"}
                        </span>
                        {w.txCount > 0 && (
                          <span className="text-slate-500 font-mono-num">{w.txCount} tx</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ZONE 3: ASYMMETRIC 12-COLUMN PULSE (ASET & TAGIHAN) */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5 surface-card rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">Aset Bersih &amp; Utang</h2>
                {openDebtItems.length > 0 && (
                  <span
                    className={`text-[11px] tabular-nums font-semibold ${
                      debtsSummary.netDebtPosition >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    Net {debtsSummary.netDebtPosition >= 0 ? "+" : ""}
                    {formatRupiah(debtsSummary.netDebtPosition)}
                  </span>
                )}
              </div>

              <div className="text-2xl font-bold font-heading text-emerald-400">
                {formatRupiah(netWorthTotal)}
              </div>

              <div className="space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-[var(--bg-inset)] overflow-hidden flex">
                  {assetSharePct > 0 && (
                    <div
                      style={{ width: `${assetSharePct}%` }}
                      className="bg-emerald-400 chart-bar-fill"
                      title="Aset Bersih"
                    />
                  )}
                  {piutangSharePct > 0 && (
                    <div
                      style={{ width: `${piutangSharePct}%` }}
                      className="bg-accent-400 chart-bar-fill"
                      title="Piutang"
                    />
                  )}
                  {utangSharePct > 0 && openUtang > 0 && (
                    <div
                      style={{ width: `${utangSharePct}%` }}
                      className="bg-rose-400 chart-bar-fill"
                      title="Utang"
                    />
                  )}
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    Utang:{" "}
                    <strong className="tabular-nums text-rose-400">
                      {formatRupiah(openUtang)}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Piutang:{" "}
                    <strong className="tabular-nums text-emerald-400">
                      {formatRupiah(openPiutang)}
                    </strong>
                  </span>
                </div>
              </div>

              {openDebtItems.length > 0 && (
                <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-300">
                  {openDebtItems.slice(0, 3).map((d) => (
                    <span key={d.id} className="inline-flex items-center gap-1">
                      <span
                        className={
                          d.type === "piutang" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"
                        }
                      >
                        {d.type === "piutang" ? "+" : "-"}
                      </span>
                      <span>{d.person}:</span>
                      <strong className="font-mono-num text-slate-100">
                        {d.amount === null ? "?" : formatRupiah(d.amount)}
                      </strong>
                    </span>
                  ))}
                  {openDebtItems.length > 3 && (
                    <span className="text-slate-400">+{openDebtItems.length - 3} lainnya</span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Net harian:{" "}
                <strong className="text-slate-200 tabular-nums">
                  {formatRupiah(surplus?.dailyNetAfterDebts ?? 0)}
                </strong>
              </span>
              <Link
                href="/tabungan#utang"
                className="text-xs font-medium text-accent-300 hover:text-accent-200 flex items-center gap-1 shrink-0"
              >
                <span>Kelola Utang</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="md:col-span-7 surface-card rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>Tagihan Terdekat</span>
              </h2>
              <span className="text-[11px] text-slate-400 font-mono-num">
                Wajib: {formatRupiah(reminders?.monthlyFixedNeeded ?? 0)}/bln
              </span>
            </div>

            <div className="space-y-2.5 flex-1">
              {upcomingActiveBills.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">
                  Belum ada jadwal tagihan tetap bulan ini.
                </p>
              ) : (
                upcomingActiveBills.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-8 h-8 rounded-lg border flex flex-col items-center justify-center shrink-0 font-mono-num text-xs font-bold ${
                          b.paidInCurrentCycle
                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                            : b.urgency === "OVERDUE" || b.urgency === "TODAY"
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                            : "bg-[var(--bg-inset)] border-[var(--border-default)] text-slate-200"
                        }`}
                        title={b.nextDueDate ? `Jatuh tempo ${b.nextDueDate}` : undefined}
                      >
                        {getDueDayBadge(b)}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs text-slate-100 font-medium truncate block">
                          {b.name.split("(")[0].trim()}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono-num">
                          {formatRupiah(b.dueAmount)}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold shrink-0 ${
                        b.paidInCurrentCycle
                          ? "bg-emerald-500/15 text-emerald-300"
                          : b.urgency === "OVERDUE" || b.urgency === "TODAY"
                          ? "bg-rose-500/15 text-rose-300"
                          : b.urgency === "SOON"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-[var(--track-bg)] text-slate-300"
                      }`}
                    >
                      {b.paidInCurrentCycle ? (
                        <>
                          <Check className="w-3 h-3" aria-hidden="true" />
                          <span>Lunas</span>
                        </>
                      ) : (
                        b.dueLabel
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-end">
              <Link
                href="/tabungan#tagihan"
                className="text-xs font-medium text-accent-300 hover:text-accent-200 flex items-center gap-1"
              >
                <span>Kelola Tagihan</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ZONE 4: EDITORIAL TRANSACTIONS + VISUAL CYCLE ANALYTICS DRAWER */}
        <section className="surface-card rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Transaksi Terbaru</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeReport.period.rangeLabel} · {activeReport.summary.txCount} transaksi
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {periods.length > 0 && (
                <select
                  aria-label="Pilih periode siklus"
                  value={activeReport.period.key}
                  onChange={(e) => setSelectedPeriodKey(e.target.value)}
                  className="bg-[var(--bg-inset)] text-slate-200 border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent-500"
                >
                  {periods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.shortLabel}
                      {p.isCurrent ? " (Aktif)" : ""}
                    </option>
                  ))}
                </select>
              )}

              <Link
                href={`/riwayat?period=${encodeURIComponent(activeReport.period.key)}`}
                className="text-xs text-accent-300 hover:text-accent-200 font-medium flex items-center gap-0.5 shrink-0"
              >
                <span>Lihat Semua</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {recentTx.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 space-y-2">
              <p>Belum ada transaksi pada {activeReport.period.label}.</p>
              {activeReport.period.isCurrent && periods.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedPeriodKey(periods[1].key)}
                  className="px-3 py-1.5 rounded-lg bg-accent-500/15 text-accent-300 border border-accent-500/30 hover:bg-accent-500/25 font-semibold pressable"
                >
                  Cek periode {periods[1].shortLabel} ({periods[1].rangeLabel})
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {recentTx.map((tx) => {
                const isIncome = tx.type === "income";
                return (
                  <div
                    key={tx.id}
                    className="py-3 -mx-2 px-2 rounded-xl flex items-center justify-between gap-3 text-xs group hover:bg-[var(--hover-tint)] transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => !isIncome && handleToggleIntent(tx.id)}
                        disabled={isIncome || busyTxId === tx.id}
                        title={
                          isIncome
                            ? "Pemasukan"
                            : "Klik untuk ubah status (NEED / WANT / GIFT / ASSET)"
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 transition border disabled:opacity-70 pressable ${
                          isIncome
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                            : tx.intent === "NEED"
                            ? "bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border-blue-500/25"
                            : tx.intent === "GIFT"
                            ? "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border-purple-500/25"
                            : tx.intent === "ASSET"
                            ? "bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border-sky-500/25"
                            : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border-amber-500/25"
                        }`}
                      >
                        {busyTxId === tx.id && <Spinner className="w-2.5 h-2.5" />}
                        <span>{isIncome ? "MASUK" : tx.intent}</span>
                      </button>

                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-100 truncate">
                          {tx.item}
                        </div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>{tx.category}</span>
                          <span>·</span>
                          <span>{formatShortDate(tx.createdAt, tx.timeKnown !== false)}</span>
                          {(tx.walletName || tx.paymentMethod) && (
                            <>
                              <span>·</span>
                              <span className="text-slate-300 font-medium">
                                {tx.walletName || tx.paymentMethod}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[13px] font-semibold font-mono-num ${
                          isIncome ? "text-emerald-400" : "text-slate-100"
                        }`}
                      >
                        {isIncome ? `+${formatRupiah(tx.amount)}` : formatRupiah(tx.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTx(tx.id)}
                        disabled={busyTxId === tx.id}
                        aria-label="Hapus transaksi"
                        title="Hapus transaksi"
                        className="p-1.5 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-100 transition"
                      >
                        {busyTxId === tx.id ? (
                          <Spinner className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* COLLAPSIBLE CYCLE ANALYTICS DRAWER */}
        {hasAnalyticsData && (
          <section className="surface-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={analyticsOpen}
                onClick={() => setAnalyticsOpen((prev) => !prev)}
                className="flex items-center gap-2.5 text-left flex-1 min-w-0 pressable"
              >
                <Clock className="w-4 h-4 text-accent-300 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                    <span>Pola Belanja &amp; Rutin Variabel</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                        analyticsOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {peakSlot?.spent > 0
                      ? `Paling boros: ${peakSlot.label} (${peakSlot.hours})`
                      : `Periode ${activeReport.period.shortLabel}`}
                    {varAvgs.length > 0 && ` · Rutin: ~${formatRupiah(varMonthlyTotal)}/bln`}
                  </p>
                </div>
              </button>

              <Link
                href={`/laporan?period=${encodeURIComponent(activeReport.period.key)}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] border border-[var(--border-subtle)] text-[11px] font-medium text-accent-300 shrink-0"
              >
                <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Laporan</span>
              </Link>
            </div>

            {analyticsOpen && (
              <div className="px-4 pb-5 pt-3 border-t border-[var(--border-subtle)] space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      Pola Jam Belanja ({activeReport.period.shortLabel})
                    </span>
                    {peakSlot?.spent > 0 && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        Puncak: {peakSlot.label} ({peakSlot.hours})
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {hourlySlots.map((slot) => {
                      const isPeak = slot.key === peakSlot?.key && slot.spent > 0;
                      const heightPct =
                        slot.spent > 0 ? Math.max(10, Math.round((slot.spent / maxSlotSpent) * 100)) : 0;

                      return (
                        <div
                          key={slot.key}
                          className={`p-2 sm:p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                            isPeak
                              ? "bg-amber-500/[0.08] border-amber-500/30"
                              : "bg-[var(--bg-inset)] border-[var(--border-subtle)]"
                          }`}
                        >
                          <div className="text-[11px] font-mono-num text-center text-slate-300 font-semibold">
                            {slot.percent}%
                          </div>

                          <div className="h-20 w-full flex items-end justify-center px-1.5 sm:px-3">
                            <div className="w-full h-full rounded-lg bg-[var(--track-bg)] flex items-end overflow-hidden">
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t-md chart-bar-fill ${
                                  isPeak ? "bg-amber-400" : "bg-accent-500/85"
                                }`}
                              />
                            </div>
                          </div>

                          <div className="text-center space-y-0.5">
                            <div
                              className={`text-[11px] font-semibold truncate ${
                                isPeak ? "text-amber-300" : "text-slate-200"
                              }`}
                            >
                              {slot.label}
                            </div>
                            <div className="text-[11px] font-mono-num text-slate-300 font-bold truncate">
                              {formatRupiah(slot.spent)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {varAvgs.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-200">
                        Rata-Rata Rutin Variabel ({varCycles} siklus)
                      </span>
                      <span className="font-mono-num font-semibold text-emerald-400">
                        Estimasi: {formatRupiah(varMonthlyTotal)}/bln
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {varAvgs.map((v) => {
                        const sharePct =
                          varMonthlyTotal > 0
                            ? Math.round(((Number(v.avgMonthly) || 0) / varMonthlyTotal) * 100)
                            : 0;
                        return (
                          <div
                            key={v.key}
                            className="p-3.5 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-2 font-semibold text-slate-100">
                                <span className="w-6 h-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-accent-300">
                                  <RoutineIcon bucketKey={v.key} className="w-3.5 h-3.5" />
                                </span>
                                <span>{v.label}</span>
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono-num">
                                {v.count}x · {sharePct}%
                              </span>
                            </div>

                            <div className="text-sm font-bold font-mono-num text-slate-100">
                              {formatRupiah(v.avgMonthly)}
                              <span className="text-[11px] text-slate-400 font-normal">/bln</span>
                            </div>

                            <div className="h-1.5 rounded-full bg-[var(--track-bg)] overflow-hidden">
                              <div
                                style={{ width: `${Math.max(4, sharePct)}%` }}
                                className="h-full rounded-full bg-accent-500 chart-bar-fill"
                              />
                            </div>

                            <div className="text-[11px] text-slate-400">
                              Rata-rata {formatRupiah(v.avgPerTx || 0)}/kali
                            </div>

                            {Array.isArray(v.byPeriod) && v.byPeriod.length > 0 && (
                              <div className="pt-1.5 border-t border-[var(--border-subtle)] space-y-1">
                                {v.byPeriod.map((bp) => (
                                  <div
                                    key={bp.key}
                                    className="flex items-center justify-between text-[11px] text-slate-400"
                                  >
                                    <span>{bp.shortLabel}</span>
                                    <span className="font-mono-num text-slate-300">
                                      {formatRupiah(bp.total)} ({bp.count}x)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <QuickLogModal
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => reload()}
        wallets={profile?.wallets || []}
        agentName={agent.name}
      />
    </div>
  );
}
