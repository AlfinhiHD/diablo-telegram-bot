"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { IntentDonut, RoutineIcon } from "@/components/FinanceCharts";
import { PageSkeleton, DiabloScreenLoader } from "@/components/DiabloLoader";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, formatShortDate } from "@/lib/format";
import { listAvailablePeriods, computePeriodReport } from "@/lib/period-report";
import { normalizeAgent } from "@/lib/agent-persona";
import {
  FileSpreadsheet,
  Clock,
  Wallet,
  ChevronRight,
  ArrowUpRight,
  Table2,
  PieChart,
} from "lucide-react";

function LaporanContent() {
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get("period") || "";

  const { data, loading, reload } = useDiabloData();
  const [mounted, setMounted] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(urlPeriod);
  const [reportTab, setReportTab] = useState("ringkasan");

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (periods.length > 1 && periods[0].expenseCount === 0 && periods[1].txCount > 0) {
      return periods[1].key;
    }
    return periods[0]?.key || "";
  }, [selectedPeriod, periods]);

  const report = useMemo(
    () => computePeriodReport(profile || {}, transactions, defaultPeriodKey || null),
    [profile, transactions, defaultPeriodKey]
  );

  if (!mounted || (loading && !data)) {
    return (
      <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
        <Nav />
        <PageSkeleton variant="laporan" />
      </div>
    );
  }

  const agent = normalizeAgent(profile?.agent);
  const s = report.summary;
  const i = report.intents;
  const comp = report.comparison;
  const exportHref = `/api/diablo?export=csv&period=${encodeURIComponent(report.period.key)}`;

  const cashflowBase = Math.max(1, s.totalIncome + s.totalExpense);
  const incomeRatioPct = Math.round((s.totalIncome / cashflowBase) * 100);
  const expenseRatioPct = Math.max(0, 100 - incomeRatioPct);

  const hourlySlots = report.hourlyStats?.slots || [];
  const peakSlot = report.hourlyStats?.peakSlot;
  const maxSlotSpent = Math.max(1, ...hourlySlots.map((slot) => Number(slot.spent) || 0));

  const varTotal = (report.variableBreakdown || []).reduce((acc, v) => acc + v.total, 0);

  const donutSegments = [
    { key: "NEED", label: "NEED", percent: i.needsPercent, color: "var(--color-blue-500)" },
    { key: "WANT", label: "WANT", percent: i.wantsPercent, color: "var(--color-amber-400)" },
    { key: "GIFT", label: "GIFT", percent: i.giftsPercent, color: "var(--color-purple-400)" },
    { key: "ASSET", label: "ASSET", percent: i.assetsPercent, color: "var(--color-sky-400)" },
  ];

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav
        userId={data?.userId}
        profile={profile}
        onQuickLog={() => setQuickLogOpen(true)}
      />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5">
        {/* Header + Period Selector + Download Sheet */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Laporan Periode
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {report.period.label} ({report.period.rangeLabel}) · {s.txCount} transaksi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {periods.length > 0 && (
              <select
                aria-label="Pilih periode laporan"
                value={report.period.key}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-xs font-medium text-slate-100 focus:outline-none focus:border-accent-500"
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.shortLabel} ({p.txCount} tx){p.isCurrent ? " · Aktif" : ""}
                  </option>
                ))}
              </select>
            )}

            <a
              href={exportHref}
              download={`diablo-laporan-${report.period.key}.csv`}
              className="min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[var(--cta-ink)] font-semibold text-xs shrink-0 pressable"
            >
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
              <span>Download Sheet (.csv)</span>
            </a>
          </div>
        </div>

        {/* KPI VAULT + TUG-OF-WAR RATIO BAR */}
        <section
          data-tone={s.netCashflow >= 0 ? "safe" : "danger"}
          className="hero-vault rounded-2xl p-5 space-y-4"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0 lg:divide-x lg:divide-[var(--border-subtle)]">
            <div className="lg:pr-5">
              <span className="text-[11px] text-slate-400 block">Pemasukan</span>
              <div className="text-lg sm:text-xl font-bold font-heading text-emerald-400 mt-1">
                +{formatRupiah(s.totalIncome)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{s.incomeCount} transaksi masuk</div>
            </div>

            <div className="lg:px-5">
              <span className="text-[11px] text-slate-400 block">Pengeluaran</span>
              <div className="text-lg sm:text-xl font-bold font-heading text-slate-100 mt-1">
                {formatRupiah(s.totalExpense)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>{s.expenseCount}x keluar</span>
                {comp && (
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold ${
                      comp.diff > 0
                        ? "bg-rose-500/15 text-rose-300"
                        : comp.diff < 0
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-[var(--track-bg)] text-slate-400"
                    }`}
                  >
                    {comp.diff > 0 ? "+" : ""}
                    {comp.diffPercent}% vs {comp.prevLabel}
                  </span>
                )}
              </div>
            </div>

            <div className="lg:px-5">
              <span className="text-[11px] text-slate-400 block">Arus Kas Bersih</span>
              <div
                className={`text-lg sm:text-xl font-bold font-heading mt-1 ${
                  s.netCashflow >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {s.netCashflow >= 0 ? "+" : "-"}
                {formatRupiah(Math.abs(s.netCashflow))}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {report.period.isCurrent
                  ? `Hari ke-${report.period.daysElapsed}/${report.period.totalDays}`
                  : `${report.period.totalDays} hari penuh`}
              </div>
            </div>

            <div className="lg:pl-5">
              <span className="text-[11px] text-slate-400 block">Rata-rata / Hari</span>
              <div className="text-lg sm:text-xl font-bold font-heading text-slate-100 mt-1">
                {formatRupiah(s.avgDailyExpense)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                {report.peakDay
                  ? `Puncak ${report.peakDay.label}: ${formatRupiah(report.peakDay.expense)}`
                  : "Belum ada pengeluaran"}
              </div>
            </div>
          </div>

          {(s.totalIncome > 0 || s.totalExpense > 0) && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Rasio Pemasukan vs Pengeluaran</span>
                <span className="font-mono-num text-slate-200">
                  {incomeRatioPct}% masuk · {expenseRatioPct}% keluar
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--bg-inset)] overflow-hidden flex border border-[var(--border-subtle)]">
                {incomeRatioPct > 0 && (
                  <div
                    style={{ width: `${incomeRatioPct}%` }}
                    className="bg-emerald-400 chart-bar-fill"
                    title={`Masuk ${incomeRatioPct}%`}
                  />
                )}
                {expenseRatioPct > 0 && (
                  <div
                    style={{ width: `${expenseRatioPct}%` }}
                    className="bg-rose-400 chart-bar-fill"
                    title={`Keluar ${expenseRatioPct}%`}
                  />
                )}
              </div>
            </div>
          )}
        </section>

        {/* 2-TAB SWITCHER */}
        <div
          role="tablist"
          aria-label="Tampilan laporan"
          className="inline-flex items-center gap-1 bg-[var(--bg-inset)] p-1 rounded-xl border border-[var(--border-subtle)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={reportTab === "ringkasan"}
            onClick={() => setReportTab("ringkasan")}
            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition pressable ${
              reportTab === "ringkasan"
                ? "bg-[var(--bg-active)] text-slate-100 border border-accent-500/35 shadow-xs"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <PieChart className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
            <span>Ringkasan &amp; Pola</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reportTab === "sheet"}
            onClick={() => setReportTab("sheet")}
            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition pressable ${
              reportTab === "sheet"
                ? "bg-[var(--bg-active)] text-slate-100 border border-accent-500/35 shadow-xs"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <Table2 className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
            <span>Tabel Sheet ({report.transactions.length})</span>
          </button>
        </div>

        {reportTab === "ringkasan" ? (
          <div className="space-y-5">
            {/* Komposisi Pengeluaran (IntentDonut + Insights) */}
            <section className="surface-card rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Audit &amp; Komposisi Pengeluaran
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Distribusi prioritas pengeluaran selama {report.period.label}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                {s.totalExpense > 0 && (
                  <IntentDonut
                    size={128}
                    strokeWidth={14}
                    segments={donutSegments}
                    centerValue={`${i.needsPercent}%`}
                    centerLabel="NEED"
                  />
                )}

                <div className="flex-1 space-y-3 min-w-0">
                  {s.totalExpense > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                        NEED <strong className="font-mono-num">{i.needsPercent}%</strong> (
                        {formatRupiah(i.needsTotal)})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                        WANT <strong className="font-mono-num">{i.wantsPercent}%</strong> (
                        {formatRupiah(i.wantsTotal)})
                      </span>
                      {i.giftsTotal > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
                          GIFT <strong className="font-mono-num">{i.giftsPercent}%</strong> (
                          {formatRupiah(i.giftsTotal)})
                        </span>
                      )}
                      {i.assetsTotal > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                          ASSET <strong className="font-mono-num">{i.assetsPercent}%</strong> (
                          {formatRupiah(i.assetsTotal)})
                        </span>
                      )}
                    </div>
                  )}

                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {report.insights.map((line, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-accent-300 font-bold mt-0.5">·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* Kategori + Top 5 */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="surface-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-100">
                  Pengeluaran per Kategori
                </h3>
                {report.categories.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">
                    Belum ada pengeluaran pada periode ini.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {report.categories.map((cat, idx) => (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-medium text-slate-200 flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{cat.category}</span>
                            <span className="text-[11px] text-slate-400">({cat.count}x)</span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300">
                                Terbesar
                              </span>
                            )}
                          </span>
                          <span className="font-mono-num font-semibold text-slate-100 shrink-0">
                            {formatRupiah(cat.spent)}{" "}
                            <span className="text-[11px] text-slate-400">({cat.percent}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--bg-inset)] overflow-hidden">
                          <div
                            style={{ width: `${Math.max(4, cat.percent)}%` }}
                            className={`h-full rounded-full chart-bar-fill ${
                              idx === 0 ? "bg-amber-400" : "bg-accent-500"
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="surface-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-100">
                  Top 5 Pengeluaran Terbesar
                </h3>
                {report.topExpenses.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">
                    Belum ada pengeluaran pada periode ini.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {report.topExpenses.map((tx, idx) => (
                      <div key={tx.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-slate-300 font-mono-num text-[11px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-100 truncate">{tx.item}</div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {tx.category} · {formatShortDate(tx.createdAt, tx.timeKnown !== false)}
                              {tx.walletName ? ` · ${tx.walletName}` : ""}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono-num font-semibold text-slate-100 shrink-0">
                          {formatRupiah(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Pola Jam Belanja (5-Column Vertical Bar Chart) */}
            <section className="surface-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Pola Jam Belanja ({report.period.shortLabel})
                  </h3>
                </div>
                {peakSlot?.spent > 0 && (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                    Jam Boros: {peakSlot.label} ({peakSlot.hours})
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

                      <div className="h-24 w-full flex items-end justify-center px-1.5 sm:px-4">
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
                        <div className="text-[11px] text-slate-500 hidden sm:block truncate">
                          {slot.hours}
                        </div>
                        <div className="text-xs font-bold font-mono-num text-slate-100 truncate">
                          {formatRupiah(slot.spent)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Rutin Variabel & Aktivitas Sumber Dana */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {report.variableBreakdown?.some((v) => v.total > 0) && (
                <section className="surface-card rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        Kebutuhan Rutin Variabel
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Kuota, bensin, listrik, laundry &amp; rokok ({report.period.shortLabel})
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-bold font-mono-num bg-accent-500/15 text-accent-300 border border-accent-500/30">
                      {formatRupiah(varTotal)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {report.variableBreakdown.map((v) => {
                      const sharePct = varTotal > 0 ? Math.round((v.total / varTotal) * 100) : 0;
                      return (
                        <div
                          key={v.key}
                          className="p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 truncate">
                              <RoutineIcon bucketKey={v.key} className="w-3.5 h-3.5 text-accent-300 shrink-0" />
                              <span className="truncate">{v.label}</span>
                            </span>
                            {v.total > 0 && (
                              <span className="text-[11px] font-mono-num text-slate-400">
                                {sharePct}%
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold font-mono-num text-slate-100">
                            {formatRupiah(v.total)}
                          </div>
                          <div className="h-1 rounded-full bg-[var(--track-bg)] overflow-hidden">
                            <div
                              style={{ width: `${v.total > 0 ? Math.max(6, sharePct) : 0}%` }}
                              className="h-full rounded-full bg-accent-500 chart-bar-fill"
                            />
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {v.count > 0
                              ? `${v.count}x · ~${formatRupiah(Math.round(v.total / v.count))}/x`
                              : "Tidak ada"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {report.byWallet.length > 0 && (
                <section className="surface-card rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-accent-300" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-slate-100">
                      Aktivitas Sumber Dana ({report.period.shortLabel})
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {report.byWallet.map((w) => (
                      <Link
                        key={w.id}
                        href={`/riwayat?period=${encodeURIComponent(
                          report.period.key
                        )}&wallet=${encodeURIComponent(w.id)}`}
                        className="wallet-tile p-3 rounded-xl block pressable"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-100">
                          <span className="truncate">{w.name}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        </div>
                        <div className="text-xs font-mono-num font-bold text-slate-100 mt-1.5">
                          Keluar: {formatRupiah(w.expenseTotal)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {w.incomeTotal > 0 ? `Masuk: +${formatRupiah(w.incomeTotal)} · ` : ""}
                          {w.txCount} tx
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : (
          <section className="surface-card rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Sheet Transaksi ({report.transactions.length})
                </h2>
                <p className="text-[11px] text-slate-400">
                  Klik &ldquo;Download Sheet (.csv)&rdquo; di atas untuk membuka lengkap di Google Sheets / Excel.
                </p>
              </div>
              <Link
                href={`/riwayat?period=${encodeURIComponent(report.period.key)}`}
                className="text-xs text-accent-300 hover:text-accent-200 font-medium flex items-center gap-1 shrink-0"
              >
                <span>Kelola di Riwayat</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            {report.transactions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Belum ada catatan transaksi pada {report.period.label}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[11px] font-semibold text-slate-400">
                      <th className="py-2.5 pr-3">Waktu</th>
                      <th className="py-2.5 pr-3">Item</th>
                      <th className="py-2.5 pr-3 hidden sm:table-cell">Kategori</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 pr-3 hidden sm:table-cell">Dana</th>
                      <th className="py-2.5 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {report.transactions.map((tx) => {
                      const isInc = tx.type === "income";
                      return (
                        <tr key={tx.id} className="hover:bg-[var(--hover-tint)]">
                          <td className="py-2.5 pr-3 text-[11px] text-slate-400 whitespace-nowrap font-mono-num">
                            {formatShortDate(tx.createdAt, tx.timeKnown !== false)}
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-slate-100 max-w-[180px] truncate">
                            {tx.item}
                          </td>
                          <td className="py-2.5 pr-3 text-[11px] text-slate-400 hidden sm:table-cell">
                            {tx.category || "-"}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                isInc
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                  : tx.intent === "NEED"
                                  ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                                  : tx.intent === "GIFT"
                                  ? "bg-purple-500/15 text-purple-300 border-purple-500/25"
                                  : tx.intent === "ASSET"
                                  ? "bg-sky-500/15 text-sky-300 border-sky-500/25"
                                  : "bg-amber-500/15 text-amber-300 border-amber-500/25"
                              }`}
                            >
                              {isInc ? "MASUK" : tx.intent || "WANT"}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-[11px] text-slate-400 hidden sm:table-cell">
                            {tx.walletName || tx.paymentMethod || "-"}
                          </td>
                          <td
                            className={`py-2.5 text-right font-mono-num font-semibold whitespace-nowrap ${
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

export default function LaporanPage() {
  return (
    <Suspense fallback={<DiabloScreenLoader subtitle="Menyusun laporan bulanan..." />}>
      <LaporanContent />
    </Suspense>
  );
}
