"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import DiabloAvatar from "@/components/DiabloAvatar";
import QuickLogModal from "@/components/QuickLogModal";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, formatShortDate } from "@/lib/format";
import {
  Wallet,
  PiggyBank,
  Calendar,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Clock,
  Lock,
  Landmark,
  Banknote,
  Receipt,
  Bell,
  CreditCard,
  TrendingUp,
} from "lucide-react";

export default function HomePage() {
  const { data, loading, reload } = useDiabloData();
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  async function handleToggleIntent(txId) {
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_intent", txId }),
      });
      if (res.ok) reload();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeleteTx(txId) {
    if (!confirm("Hapus transaksi ini? Saldo dompet terkait akan disesuaikan otomatis.")) return;
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_tx", txId }),
      });
      if (res.ok) reload();
    } catch (e) {
      console.error(e);
    }
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas flex flex-col items-center justify-center p-4">
        <DiabloAvatar className="w-12 h-12 mb-3 animate-pulse" />
        <p className="text-xs text-slate-400 font-mono">Menyiapkan pundi-pundi Tuan...</p>
      </div>
    );
  }

  const profile = data?.profile;
  const analytics = data?.analytics;
  const transactions = data?.transactions || [];
  const recentTx = transactions.slice(0, 6);
  const wallets = analytics?.walletSummary?.wallets || profile?.wallets || [];
  const debtsSummary = analytics?.debtsSummary;
  const reminders = analytics?.reminders;
  const surplus = analytics?.surplusSummary;
  const varAvgs = (analytics?.variableAverages || []).filter((v) => v.total > 0);

  const displayName = profile?.ownerName || profile?.telegramName || (data?.userId === "1128526190" ? "Alfin" : "Tuan");
  const isConfigured = profile && (profile.monthlyIncome > 0 || wallets.length > 0);
  const todayRemaining = analytics?.budget?.todayRemaining ?? 0;
  const creditDebtTotal = analytics?.budget?.creditDebtTotal ?? 0;
  const isOverbudget = todayRemaining < 0;

  const upcomingActiveBills = (reminders?.upcomingBills || []).filter((b) => b.amount > 0).slice(0, 3);

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} profile={data?.profile} onQuickLog={() => setQuickLogOpen(true)} />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {!isConfigured && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-amber-200">
                  Pundi-pundi Belum Dikonfigurasi
                </h4>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  Atur gaji bulanan, tanggal gajian, dan pos tabungan agar Diablo bisa menghitung jatah harian Tuan.
                </p>
              </div>
            </div>
            <Link
              href="/atur"
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0 transition"
            >
              Atur Sekarang
            </Link>
          </div>
        )}

        {/* HERO CARD: "Boleh Dipakai Hari Ini" */}
        <section className="bento-card rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-40 h-40 opacity-[0.07] pointer-events-none select-none">
            <DiabloAvatar className="w-full h-full" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 relative z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Boleh Dipakai Hari Ini
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                  isOverbudget
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {isOverbudget ? "Overbudget" : "Aman"}
              </span>
              {creditDebtTotal > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Sudah potong PayLater {formatRupiah(creditDebtTotal)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-slate-300 font-medium">{displayName}</span>
              <span className="text-slate-600">•</span>
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {analytics?.cycle?.daysRemaining ?? 0} hari ke gajian (tgl {profile?.paydayDate || 25})
              </span>
            </div>
          </div>

          <div className="flex items-baseline gap-2 relative z-10">
            <h1
              className={`text-4xl sm:text-5xl font-extrabold tracking-tight font-heading ${
                isOverbudget ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {formatRupiah(todayRemaining)}
            </h1>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 relative z-10">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span>
                Jatah normal:{" "}
                <strong className="text-slate-200">
                  {formatRupiah(analytics?.budget?.safeDailySpend ?? 0)}/hari
                </strong>
              </span>
              <span>•</span>
              <span>
                Keluar hari ini:{" "}
                <strong className="text-slate-200">
                  {formatRupiah(analytics?.budget?.todaySpent ?? 0)}
                </strong>
              </span>
              {(analytics?.budget?.todayIncome ?? 0) > 0 && (
                <>
                  <span>•</span>
                  <span>
                    Masuk hari ini:{" "}
                    <strong className="text-emerald-400">
                      +{formatRupiah(analytics.budget.todayIncome)}
                    </strong>
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => setQuickLogOpen(true)}
              className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-200 font-semibold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Catat Transaksi
            </button>
          </div>
        </section>

        {/* DOMPET & SUMBER DANA */}
        {wallets.length > 0 && (
          <section className="bento-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sumber Dana & PayLater
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Klik dana untuk lihat riwayat terpisah • Audit & pindah dana di menu Tabungan
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-500 block">Likuid Bersih</span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  {formatRupiah(analytics?.walletSummary?.liquidTotal ?? 0)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {wallets.map((w) => {
                const isLocked = w.locked || w.role === "emergency";
                const isCredit = w.role === "credit";
                const isDaily = w.role === "daily";
                const hasCreditDebt = isCredit && w.balance < 0;

                return (
                  <Link
                    key={w.id}
                    href={`/riwayat?wallet=${encodeURIComponent(w.id)}`}
                    className={`p-3 rounded-xl border transition group flex flex-col justify-between gap-2 ${
                      hasCreditDebt
                        ? "bg-rose-500/[0.10] border-rose-500/35 hover:border-rose-400/60"
                        : isCredit
                        ? "bg-slate-900/65 border-slate-800 hover:border-accent-500/40"
                        : isLocked
                        ? "bg-slate-900/55 border-slate-800/80 hover:border-amber-500/40"
                        : isDaily
                        ? "bg-accent-500/[0.12] border-accent-500/35 hover:border-accent-300/55"
                        : "bg-slate-900/75 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-slate-200 truncate">
                        {w.name}
                      </span>
                      {isLocked ? (
                        <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                      ) : isCredit ? (
                        <CreditCard className={`w-3.5 h-3.5 shrink-0 ${hasCreditDebt ? "text-rose-400" : "text-emerald-400"}`} />
                      ) : w.id === "cash" ? (
                        <Banknote className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Landmark className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                    </div>
                    <div>
                      <div
                        className={`text-sm font-bold font-mono-num ${
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
                      <div className="text-[9px] text-slate-500 mt-0.5 flex items-center justify-between">
                        <span>
                          {isLocked
                            ? "Dana Darurat"
                            : isCredit
                            ? hasCreditDebt
                              ? "Tagihan Berjalan"
                              : "PayLater"
                            : isDaily
                            ? "Dana Harian"
                            : "Simpanan"}
                        </span>
                        {w.txCount > 0 && <span className="text-slate-400">{w.txCount} tx</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 3 BENTO SUB-CARDS: Surplus & Dana Harian | Reminder Tagihan | Tabungan & Utang */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Sisa Dana Harian & Surplus */}
          <div className="bento-subcard rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Dana Harian & Surplus</span>
              <TrendingUp className="w-4 h-4 text-accent-300" />
            </div>
            <div>
              <div className="text-2xl font-bold font-heading text-slate-100">
                {formatRupiah(analytics?.budget?.remainingBudget ?? 0)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Setelah net utang/piutang:{" "}
                <strong className="text-slate-300">
                  {formatRupiah(surplus?.dailyNetAfterDebts ?? 0)}
                </strong>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Proyeksi surplus tgl {profile?.paydayDate || 25}</span>
              <span
                className={`font-semibold font-mono ${
                  (surplus?.projectedEndCycleSurplus ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {(surplus?.projectedEndCycleSurplus ?? 0) >= 0 ? "+" : ""}
                {formatRupiah(surplus?.projectedEndCycleSurplus ?? 0)}
              </span>
            </div>
          </div>

          {/* Card 2: Reminder & Tagihan Tetap Terdekat */}
          <Link
            href="/tabungan#tagihan"
            className="bento-subcard rounded-2xl p-5 flex flex-col justify-between group hover:border-slate-700 transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Reminder Tagihan</span>
              <Bell className="w-4 h-4 text-amber-400" />
            </div>
            <div className="space-y-1.5">
              {upcomingActiveBills.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada jadwal tagihan tetap.</p>
              ) : (
                upcomingActiveBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-[11px] gap-2">
                    <span className="text-slate-200 truncate">{b.name.split("(")[0].trim()}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-slate-300">{formatRupiah(b.dueAmount)}</span>
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
                ))
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Wajib/bln: {formatRupiah(reminders?.monthlyFixedNeeded ?? 0)}</span>
              <span className="font-semibold text-amber-400 flex items-center gap-0.5">
                Kelola <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </Link>

          {/* Card 3: Kekayaan Bersih & Utang/Piutang */}
          <Link
            href="/tabungan#utang"
            className="bento-subcard rounded-2xl p-5 flex flex-col justify-between group hover:border-slate-700 transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Utang, Piutang & Aset</span>
              <PiggyBank className="w-4 h-4 text-accent-300" />
            </div>
            <div>
              <div className="text-2xl font-bold font-heading text-emerald-400">
                {formatRupiah(analytics?.walletSummary?.netWorthTotal ?? 0)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-2">
                <span>
                  Utang: <strong className="text-rose-400">{formatRupiah(debtsSummary?.openUtangTotal ?? 0)}</strong>
                </span>
                <span>•</span>
                <span>
                  Piutang: <strong className="text-emerald-400">{formatRupiah(debtsSummary?.openPiutangTotal ?? 0)}</strong>
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Audit, Transfer & Utang</span>
              <span className="font-semibold text-accent-300 flex items-center gap-0.5">
                Buka <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        </section>

        {/* UTANG & PIUTANG RINGKAS + RATA-RATA VARIABEL */}
        {debtsSummary && debtsSummary.items?.length > 0 && (
          <section className="p-4 rounded-2xl bento-subcard flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Receipt className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <strong className="text-slate-200 block">
                  Utang & Piutang Belum Lunas ({debtsSummary.items.length}) — Net{" "}
                  <span className={debtsSummary.netDebtPosition >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {debtsSummary.netDebtPosition >= 0 ? "+" : ""}
                    {formatRupiah(debtsSummary.netDebtPosition)}
                  </span>
                </strong>
                <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {debtsSummary.items.map((d) => (
                    <span key={d.id}>
                      <span className={d.type === "piutang" ? "text-emerald-400" : "text-rose-400"}>
                        {d.type === "piutang" ? "+" : "-"}
                      </span>{" "}
                      {d.person}:{" "}
                      <strong className="text-slate-300">
                        {d.amount === null ? "?" : formatRupiah(d.amount)}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Link
              href="/tabungan#utang"
              className="text-xs text-accent-300 hover:text-accent-200 font-semibold shrink-0 flex items-center gap-0.5"
            >
              Lunasi / Snooze <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </section>
        )}

        {/* DIABLO ADVISORY */}
        <section className="p-4 rounded-2xl bento-subcard flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-xs leading-relaxed text-slate-300">
            <strong className="text-purple-300 font-semibold block mb-0.5">
              Komentar Diablo:
            </strong>
            <span>&ldquo;{analytics?.message || "Pundi-pundi Tuan dalam kendali hamba."}&rdquo;</span>
          </div>
        </section>

        {/* RATA-RATA PENGELUARAN VARIABEL (Kuota, Pulsa, Bensin, Laundry, Listrik) */}
        {varAvgs.length > 0 && (
          <section className="bento-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Rata-Rata Rutin Variabel (Keseharian)
                </h3>
                <p className="text-[10px] text-slate-500">
                  Estimasi bulanan untuk kuota, pulsa, bensin, listrik & laundry ({varAvgs[0]?.monthsObserved || 1} bln data)
                </p>
              </div>
              <Wallet className="w-4 h-4 text-slate-500" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {varAvgs.map((v) => (
                <div key={v.key} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">{v.label}</div>
                  <div className="text-sm font-bold font-mono text-slate-100 mt-1">
                    {formatRupiah(v.avgMonthly)}<span className="text-[10px] text-slate-500 font-normal">/bln</span>
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">{v.count}x tercatat</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* POLA JAM BELANJA */}
        {analytics?.hourlyStats && (
          <section className="bento-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Pola Jam Belanja (Jam Boros)
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Distribusi waktu pengeluaran harian Tuan siklus ini
                  </p>
                </div>
              </div>
              {analytics.hourlyStats.peakSlot?.spent > 0 && (
                <span className="self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  🔥 Paling Boros: {analytics.hourlyStats.peakSlot.label} ({analytics.hourlyStats.peakSlot.hours})
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              {(analytics.hourlyStats.slots || []).map((slot) => {
                const isPeak = slot.key === analytics.hourlyStats.peakSlot?.key && slot.spent > 0;
                return (
                  <div
                    key={slot.key}
                    className={`p-2.5 rounded-xl border transition ${
                      isPeak
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                        : "bg-slate-900/60 border-slate-800/80 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-medium mb-1">
                      <span className={isPeak ? "text-amber-300 font-bold" : "text-slate-300"}>
                        {slot.label}
                      </span>
                      <span>{slot.percent}%</span>
                    </div>
                    <div className="text-[9px] text-slate-500 mb-1.5">{slot.hours}</div>
                    <div className="text-xs font-bold font-mono-num text-slate-100">
                      {formatRupiah(slot.spent)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TRANSAKSI TERAKHIR */}
        <section className="bento-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Transaksi Terakhir
            </h3>
            <Link
              href="/riwayat"
              className="text-xs text-accent-300 hover:text-accent-200 font-medium flex items-center gap-1"
            >
              Lihat Semua <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentTx.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Belum ada transaksi tercatat. Ketik di bot Telegram atau klik &ldquo;+ Catat&rdquo;.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {recentTx.map((tx) => {
                const isIncome = tx.type === "income";
                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs group">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => !isIncome && handleToggleIntent(tx.id)}
                        title={isIncome ? "Pemasukan" : "Klik untuk ubah status (NEED / WANT / GIFT / ASSET)"}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 transition border ${
                          isIncome
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 cursor-default"
                            : tx.intent === "NEED"
                            ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border-blue-500/20"
                            : tx.intent === "GIFT"
                            ? "bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border-fuchsia-500/20"
                            : tx.intent === "ASSET"
                            ? "bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 border-sky-500/20"
                            : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border-amber-500/20"
                        }`}
                      >
                        {isIncome ? "MASUK" : tx.intent}
                      </button>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200 truncate">{tx.item}</div>
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>{tx.category}</span>
                          <span>•</span>
                          <span>{formatShortDate(tx.createdAt, tx.timeKnown !== false)}</span>
                          {(tx.walletName || tx.paymentMethod) && (
                            <>
                              <span>•</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] text-slate-300 font-medium">
                                {tx.walletName || tx.paymentMethod}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-semibold font-mono-num ${isIncome ? "text-emerald-400" : "text-slate-100"}`}>
                        {isIncome ? `+${formatRupiah(tx.amount)}` : formatRupiah(tx.amount)}
                      </span>
                      <button
                        onClick={() => handleDeleteTx(tx.id)}
                        title="Hapus transaksi"
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <QuickLogModal
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => reload()}
        wallets={profile?.wallets || []}
      />
    </div>
  );
}
