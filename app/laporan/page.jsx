"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { PageSkeleton, DiabloScreenLoader } from "@/components/DiabloLoader";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, formatShortDate } from "@/lib/format";
import { listAvailablePeriods, computePeriodReport } from "@/lib/period-report";
import {
  FileSpreadsheet,
  Calendar,
  TrendingUp,
  TrendingDown,
  Flame,
  Clock,
  Sparkles,
  Wallet,
  ChevronRight,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";

function LaporanContent() {
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get("period") || "";

  const { data, loading, reload } = useDiabloData();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(urlPeriod);

  useEffect(() => {
    if (urlPeriod) setSelectedPeriod(urlPeriod);
  }, [urlPeriod]);

  const profile = data?.profile;
  const transactions = data?.transactions || [];
  const paydayDate = profile?.paydayDate || 25;

  const periods = useMemo(
    () => listAvailablePeriods(transactions, paydayDate),
    [transactions, paydayDate]
  );

  const defaultPeriodKey = useMemo(() => {
    if (selectedPeriod && periods.some((p) => p.key === selectedPeriod)) {
      return selectedPeriod;
    }
    // Jika periode aktif baru mulai (0 pengeluaran) & periode sebelumnya ada data, tampilkan laporan periode selesai dulu
    if (periods.length > 1 && periods[0].expenseCount === 0 && periods[1].txCount > 0) {
      return periods[1].key;
    }
    return periods[0]?.key || "";
  }, [selectedPeriod, periods]);

  const report = useMemo(
    () => computePeriodReport(profile || {}, transactions, defaultPeriodKey || null),
    [profile, transactions, defaultPeriodKey]
  );

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
        <Nav />
        <PageSkeleton variant="laporan" />
      </div>
    );
  }

  const s = report.summary;
  const i = report.intents;
  const comp = report.comparison;
  const exportHref = `/api/diablo?export=csv&period=${encodeURIComponent(report.period.key)}`;

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav
        userId={data?.userId}
        profile={profile}
        onQuickLog={() => setQuickLogOpen(true)}
      />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Header + Download Sheet */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Laporan Periode
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {report.period.label} ({report.period.rangeLabel}) • {s.txCount} transaksi
            </p>
          </div>

          <a
            href={exportHref}
            download={`diablo-laporan-${report.period.key}.csv`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Sheet (.csv)</span>
          </a>
        </div>

        {/* Selector Periode */}
        <section className="flex items-center gap-2 overflow-x-auto pb-1">
          {periods.map((p) => {
            const active = p.key === report.period.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPeriod(p.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition border text-left ${
                  active
                    ? "bg-accent-500 text-slate-950 border-accent-400 shadow-sm"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{p.shortLabel}</span>
                  {p.isCurrent && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                        active ? "bg-slate-950/20 text-slate-950" : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      Aktif
                    </span>
                  )}
                </div>
                <div className={`text-[10px] mt-0.5 ${active ? "text-slate-900/80" : "text-slate-500"}`}>
                  {p.rangeLabel} • {p.txCount} tx
                </div>
              </button>
            );
          })}
        </section>

        {/* 4 KPI Summary Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bento-subcard rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Pemasukan</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-emerald-400">
              +{formatRupiah(s.totalIncome)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{s.incomeCount} transaksi masuk</div>
          </div>

          <div className="bento-subcard rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Pengeluaran</span>
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-slate-100">
              {formatRupiah(s.totalExpense)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
              <span>{s.expenseCount}x keluar</span>
              {comp && (
                <span
                  className={`px-1.5 py-0.2 rounded font-semibold ${
                    comp.diff > 0
                      ? "bg-rose-500/15 text-rose-300"
                      : comp.diff < 0
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {comp.diff > 0 ? "+" : ""}
                  {comp.diffPercent}% vs {comp.prevLabel}
                </span>
              )}
            </div>
          </div>

          <div className="bento-subcard rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Arus Kas Bersih</span>
              <BarChart3 className="w-3.5 h-3.5 text-accent-300" />
            </div>
            <div
              className={`text-lg sm:text-xl font-bold font-mono-num ${
                s.netCashflow >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {s.netCashflow >= 0 ? "+" : "-"}
              {formatRupiah(Math.abs(s.netCashflow))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {report.period.isCurrent ? `Hari ke-${report.period.daysElapsed}/${report.period.totalDays}` : `${report.period.totalDays} hari penuh`}
            </div>
          </div>

          <div className="bento-subcard rounded-2xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Rata-rata / Hari</span>
              <Flame className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono-num text-slate-100">
              {formatRupiah(s.avgDailyExpense)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 truncate">
              {report.peakDay
                ? `Puncak ${report.peakDay.label}: ${formatRupiah(report.peakDay.expense)}`
                : "Belum ada pengeluaran"}
            </div>
          </div>
        </section>

        {/* Insight Diablo & Komposisi NEED/WANT/GIFT/ASSET */}
        <section className="bento-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Audit &amp; Komposisi Pengeluaran
              </h2>
              <p className="text-[10px] text-slate-500">
                Ringkasan di mana paling boros selama {report.period.label}
              </p>
            </div>
          </div>

          {s.totalExpense > 0 && (
            <div className="space-y-2">
              <div className="h-3 rounded-full bg-slate-900 overflow-hidden flex border border-slate-800">
                {i.needsPercent > 0 && (
                  <div style={{ width: `${i.needsPercent}%` }} className="bg-blue-500" title={`NEED ${i.needsPercent}%`} />
                )}
                {i.wantsPercent > 0 && (
                  <div style={{ width: `${i.wantsPercent}%` }} className="bg-amber-500" title={`WANT ${i.wantsPercent}%`} />
                )}
                {i.giftsPercent > 0 && (
                  <div style={{ width: `${i.giftsPercent}%` }} className="bg-fuchsia-500" title={`GIFT ${i.giftsPercent}%`} />
                )}
                {i.assetsPercent > 0 && (
                  <div style={{ width: `${i.assetsPercent}%` }} className="bg-sky-400" title={`ASSET ${i.assetsPercent}%`} />
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  NEED <strong>{i.needsPercent}%</strong> ({formatRupiah(i.needsTotal)})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  WANT <strong>{i.wantsPercent}%</strong> ({formatRupiah(i.wantsTotal)})
                </span>
                {i.giftsTotal > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500 inline-block" />
                    GIFT <strong>{i.giftsPercent}%</strong> ({formatRupiah(i.giftsTotal)})
                  </span>
                )}
                {i.assetsTotal > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                    ASSET <strong>{i.assetsPercent}%</strong> ({formatRupiah(i.assetsTotal)})
                  </span>
                )}
              </div>
            </div>
          )}

          <ul className="space-y-1.5 text-xs text-slate-300 pt-1">
            {report.insights.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-purple-400 font-bold mt-0.5">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 2-Column Bento: Kategori Boros + Top 5 Pengeluaran */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bento-card rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Pengeluaran per Kategori
            </h3>
            {report.categories.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Belum ada pengeluaran pada periode ini.</p>
            ) : (
              <div className="space-y-3">
                {report.categories.map((cat, idx) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">
                        {idx === 0 ? "🔥 " : ""}
                        {cat.category}{" "}
                        <span className="text-[10px] text-slate-500">({cat.count}x)</span>
                      </span>
                      <span className="font-mono font-semibold text-slate-100">
                        {formatRupiah(cat.spent)}{" "}
                        <span className="text-[10px] text-slate-400">({cat.percent}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800/80">
                      <div
                        style={{ width: `${Math.max(4, cat.percent)}%` }}
                        className={`h-full rounded-full ${idx === 0 ? "bg-amber-400" : "bg-accent-500"}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bento-card rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Top 5 Pengeluaran Terbesar
            </h3>
            {report.topExpenses.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Belum ada pengeluaran pada periode ini.</p>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {report.topExpenses.map((tx, idx) => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200 truncate">{tx.item}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {tx.category} • {formatShortDate(tx.createdAt, tx.timeKnown !== false)}
                          {tx.walletName ? ` • ${tx.walletName}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-slate-100 shrink-0">
                      {formatRupiah(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Pola Jam Belanja periode ini */}
        <section className="bento-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Pola Jam Belanja ({report.period.shortLabel})
              </h3>
            </div>
            {report.hourlyStats.peakSlot?.spent > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                🔥 Jam Boros: {report.hourlyStats.peakSlot.label} ({report.hourlyStats.peakSlot.hours})
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {report.hourlyStats.slots.map((slot) => {
              const isPeak = slot.key === report.hourlyStats.peakSlot?.key && slot.spent > 0;
              return (
                <div
                  key={slot.key}
                  className={`p-2.5 rounded-xl border ${
                    isPeak
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-slate-900/60 border-slate-800/80"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className={isPeak ? "text-amber-300 font-bold" : "text-slate-300"}>
                      {slot.label}
                    </span>
                    <span className="text-slate-400">{slot.percent}%</span>
                  </div>
                  <div className="text-[9px] text-slate-500 mb-1">{slot.hours}</div>
                  <div className="text-xs font-bold font-mono-num text-slate-100">
                    {formatRupiah(slot.spent)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Kebutuhan Rutin Variabel periode ini */}
        {report.variableBreakdown?.some((v) => v.total > 0) && (
          <section className="bento-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Kebutuhan Rutin Variabel ({report.period.shortLabel})
                </h3>
                <p className="text-[10px] text-slate-500">
                  Realisasi kuota, bensin, listrik &amp; laundry pada periode ini
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-accent-500/15 text-accent-300 border border-accent-500/30">
                Total: {formatRupiah(report.variableBreakdown.reduce((acc, v) => acc + v.total, 0))}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {report.variableBreakdown.map((v) => (
                <div key={v.key} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">{v.label}</div>
                  <div className="text-sm font-bold font-mono text-slate-100 mt-1">
                    {formatRupiah(v.total)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {v.count > 0 ? `${v.count}x • rata-rata ${formatRupiah(Math.round(v.total / v.count))}/kali` : "Tidak ada transaksi"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Aktivitas Sumber Dana periode ini */}
        {report.byWallet.length > 0 && (
          <section className="bento-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-accent-300" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Aktivitas Sumber Dana ({report.period.shortLabel})
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {report.byWallet.map((w) => (
                <Link
                  key={w.id}
                  href={`/riwayat?period=${encodeURIComponent(report.period.key)}&wallet=${encodeURIComponent(w.id)}`}
                  className="p-3 rounded-xl bg-slate-900/65 border border-slate-800 hover:border-slate-700 transition block"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
                    <span className="truncate">{w.name}</span>
                    <ArrowUpRight className="w-3 h-3 text-slate-500 shrink-0" />
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-100 mt-1.5">
                    Keluar: {formatRupiah(w.expenseTotal)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {w.incomeTotal > 0 ? `Masuk: +${formatRupiah(w.incomeTotal)} • ` : ""}
                    {w.txCount} tx
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Tabel Sheet Transaksi Periode */}
        <section className="bento-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Sheet Transaksi ({report.transactions.length})
              </h3>
              <p className="text-[10px] text-slate-500">
                Klik &ldquo;Download Sheet (.csv)&rdquo; di atas untuk membuka lengkap di Google Sheets / Excel
              </p>
            </div>
            <Link
              href={`/riwayat?period=${encodeURIComponent(report.period.key)}`}
              className="text-xs text-accent-300 hover:text-accent-200 font-medium flex items-center gap-1 shrink-0"
            >
              Kelola di Riwayat <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {report.transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Belum ada catatan transaksi pada {report.period.label}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-3">Waktu</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3 hidden sm:table-cell">Kategori</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 hidden sm:table-cell">Dana</th>
                    <th className="py-2 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {report.transactions.map((tx) => {
                    const isInc = tx.type === "income";
                    return (
                      <tr key={tx.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 pr-3 text-[11px] text-slate-400 whitespace-nowrap">
                          {formatShortDate(tx.createdAt, tx.timeKnown !== false)}
                        </td>
                        <td className="py-2.5 pr-3 font-medium text-slate-200 max-w-[160px] truncate">
                          {tx.item}
                        </td>
                        <td className="py-2.5 pr-3 text-[11px] text-slate-400 hidden sm:table-cell">
                          {tx.category || "-"}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              isInc
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : tx.intent === "NEED"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                                : tx.intent === "GIFT"
                                ? "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20"
                                : tx.intent === "ASSET"
                                ? "bg-sky-500/15 text-sky-400 border-sky-500/20"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                            }`}
                          >
                            {isInc ? "MASUK" : tx.intent || "WANT"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-[11px] text-slate-400 hidden sm:table-cell">
                          {tx.walletName || tx.paymentMethod || "-"}
                        </td>
                        <td
                          className={`py-2.5 text-right font-mono font-semibold whitespace-nowrap ${
                            isInc ? "text-emerald-400" : "text-slate-100"
                          }`}
                        >
                          {isInc ? `+${formatRupiah(tx.amount)}` : formatRupiah(tx.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

export default function LaporanPage() {
  return (
    <Suspense fallback={<DiabloScreenLoader subtitle="Menyusun laporan bulanan..." />}>
      <LaporanContent />
    </Suspense>
  );
}
