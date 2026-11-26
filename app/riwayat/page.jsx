"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { PageSkeleton, DiabloScreenLoader, Spinner } from "@/components/DiabloLoader";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, groupTransactionsByDate } from "@/lib/format";
import { listAvailablePeriods, getCycleBounds } from "@/lib/period-report";
import { normalizeAgent } from "@/lib/agent-persona";
import { Search, Trash2, ReceiptText, BarChart3, X, Plus, Wallet } from "lucide-react";

function RiwayatContent() {
  const searchParams = useSearchParams();
  const initialWallet = searchParams.get("wallet") || "ALL";
  const initialPeriod = searchParams.get("period") || "";

  const { data, loading, reload } = useDiabloData();
  const [mounted, setMounted] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [filterWallet, setFilterWallet] = useState(initialWallet);
  const [filterPeriod, setFilterPeriod] = useState(initialPeriod);
  const [filterIntent, setFilterIntent] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [movingTxId, setMovingTxId] = useState(null);
  const [busyTxId, setBusyTxId] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const qW = searchParams.get("wallet");
    if (qW) setFilterWallet(qW);
    const qP = searchParams.get("period");
    if (qP) setFilterPeriod(qP);
  }, [searchParams]);

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

  async function handleChangeWallet(txId, newWalletId) {
    if (!newWalletId) return;
    setMovingTxId(txId);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_wallet", txId, walletId: newWalletId }),
      });
      if (res.ok) await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setMovingTxId(null);
    }
  }

  async function handleDeleteTx(txId) {
    if (!confirm("Hapus catatan transaksi ini? Saldo dompet terkait akan disesuaikan otomatis.")) return;
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

  const transactions = data?.transactions || [];
  const wallets = data?.profile?.wallets || [];
  const paydayDate = data?.profile?.paydayDate || 25;

  const periods = useMemo(
    () => listAvailablePeriods(transactions, paydayDate),
    [transactions, paydayDate]
  );

  const activePeriodKey =
    filterPeriod === "ALL"
      ? "ALL"
      : filterPeriod && periods.some((p) => p.key === filterPeriod)
      ? filterPeriod
      : periods[0]?.key || "ALL";

  const activePeriodObj =
    activePeriodKey !== "ALL" ? periods.find((p) => p.key === activePeriodKey) || null : null;

  const periodTransactions = useMemo(() => {
    if (activePeriodKey === "ALL") return transactions;
    const bounds = getCycleBounds(activePeriodKey, paydayDate);
    return transactions.filter((t) => {
      const d = new Date(t.createdAt);
      return !isNaN(d.getTime()) && d >= bounds.start && d < bounds.end;
    });
  }, [transactions, activePeriodKey, paydayDate]);

  const filtered = useMemo(() => {
    return periodTransactions.filter((t) => {
      const matchesWallet = filterWallet === "ALL" || t.walletId === filterWallet;
      const isIncome = t.type === "income";
      const matchesIntent =
        filterIntent === "ALL" ||
        (filterIntent === "INCOME" ? isIncome : !isIncome && t.intent === filterIntent);
      const matchesSearch =
        !searchQuery.trim() ||
        t.item.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.walletName || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesWallet && matchesIntent && matchesSearch;
    });
  }, [periodTransactions, filterWallet, filterIntent, searchQuery]);

  const grouped = useMemo(() => groupTransactionsByDate(filtered), [filtered]);

  const totalOut = filtered
    .filter((t) => (t.type || "expense") !== "income")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const totalIn = filtered
    .filter((t) => t.type === "income")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const selectedWalletObj = wallets.find((w) => w.id === filterWallet);
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    filterIntent !== "ALL" ||
    filterWallet !== "ALL" ||
    (filterPeriod && filterPeriod !== (periods[0]?.key || ""));

  function resetAllFilters() {
    setSearchQuery("");
    setFilterIntent("ALL");
    setFilterWallet("ALL");
    setFilterPeriod("");
  }

  if (!mounted || (loading && !data)) {
    return (
      <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
        <Nav />
        <PageSkeleton variant="riwayat" />
      </div>
    );
  }

  const agent = normalizeAgent(data?.profile?.agent);

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav
        userId={data?.userId}
        profile={data?.profile}
        onQuickLog={() => setQuickLogOpen(true)}
      />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5">
        {/* Header Title & Cashflow Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Riwayat Transaksi
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedWalletObj
                ? `Dana ${selectedWalletObj.name} · Saldo saat ini ${formatRupiah(selectedWalletObj.balance)}`
                : activePeriodObj
                ? `${activePeriodObj.label} (${activePeriodObj.rangeLabel})`
                : "Semua periode siklus · Terpisah per sumber dana"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {totalIn > 0 && (
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">Masuk</span>
                <span className="text-sm font-bold font-mono-num text-emerald-400">
                  +{formatRupiah(totalIn)}
                </span>
              </div>
            )}
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Keluar</span>
              <span className="text-base font-bold font-mono-num text-slate-100">
                {formatRupiah(totalOut)}
              </span>
            </div>
            <Link
              href={
                activePeriodKey !== "ALL"
                  ? `/laporan?period=${encodeURIComponent(activePeriodKey)}`
                  : "/laporan"
              }
              className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-accent-300 border border-[var(--border-subtle)] flex items-center gap-1.5 shrink-0 pressable"
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Laporan</span>
            </Link>
          </div>
        </div>

        {/* UNIFIED COMPACT FILTER CARD */}
        <section className="surface-card rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Cari transaksi"
                placeholder="Cari transaksi (kopi, makan, tagihan)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-100"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <select
              aria-label="Pilih periode siklus"
              value={activePeriodKey}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 focus:outline-none focus:border-accent-500 shrink-0"
            >
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.shortLabel} ({p.txCount})
                </option>
              ))}
              <option value="ALL">Semua Periode ({transactions.length})</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {["ALL", "INCOME", "NEED", "WANT", "GIFT", "ASSET"].map((intent) => {
                const active = filterIntent === intent;
                const label = intent === "ALL" ? "Semua" : intent === "INCOME" ? "Masuk" : intent;
                return (
                  <button
                    key={intent}
                    type="button"
                    onClick={() => setFilterIntent(intent)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition pressable ${
                      active
                        ? "bg-accent-500 text-[var(--cta-ink)]"
                        : "bg-[var(--bg-inset)] text-slate-400 hover:text-slate-100 border border-[var(--border-subtle)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-medium text-accent-300 hover:text-accent-200 px-2 py-1"
              >
                Reset filter
              </button>
            )}
          </div>

          {wallets.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setFilterWallet("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition border flex items-center gap-1.5 pressable ${
                  filterWallet === "ALL"
                    ? "bg-[var(--bg-active)] text-slate-100 border-[var(--border-default)]"
                    : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                }`}
              >
                <span>Semua Dana</span>
                <span className="text-[11px] font-mono-num text-slate-400">
                  {periodTransactions.length}
                </span>
              </button>
              {wallets.map((w) => {
                const count = periodTransactions.filter((t) => t.walletId === w.id).length;
                const active = filterWallet === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setFilterWallet(w.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition border flex items-center gap-1.5 pressable ${
                      active
                        ? "bg-[var(--bg-active)] text-slate-100 border-[var(--border-default)]"
                        : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                    }`}
                  >
                    <span>{w.name}</span>
                    <span className="text-[11px] font-mono-num text-slate-400">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Selected Wallet Context Tile */}
        {selectedWalletObj && (
          <section className="wallet-tile rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-center text-accent-300 shrink-0">
                <Wallet className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {selectedWalletObj.name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {filtered.length} transaksi sesuai filter · Keluar {formatRupiah(totalOut)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Saldo Saat Ini</span>
              <span
                className={`text-base font-bold font-mono-num ${
                  selectedWalletObj.balance < 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {formatRupiah(selectedWalletObj.balance)}
              </span>
            </div>
          </section>
        )}

        {/* List of Grouped Transactions */}
        <section className="space-y-5">
          {filtered.length === 0 ? (
            <div className="surface-card rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-center justify-center text-accent-300">
                <ReceiptText className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  {hasActiveFilters
                    ? "Tidak Ada Transaksi Sesuai Filter"
                    : "Belum Ada Catatan Transaksi"}
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? "Ubah kata kunci, periode, atau pilih sumber dana lain."
                    : "Catat pengeluaran atau pemasukan dari tombol di bawah atau melalui bot Telegram."}
                </p>
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] border border-[var(--border-default)] text-xs font-semibold text-slate-100 pressable"
                >
                  Reset Filter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setQuickLogOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] text-xs font-semibold btn-primary-diablo pressable"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Catat Transaksi</span>
                </button>
              )}
            </div>
          ) : (
            grouped.map(([dateLabel, items]) => {
              const dayOut = items
                .filter((i) => (i.type || "expense") !== "income")
                .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
              const dayIn = items
                .filter((i) => i.type === "income")
                .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
              return (
                <div key={dateLabel} className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-xs text-slate-400">
                    <span className="px-2.5 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-semibold text-slate-200">
                      {dateLabel}
                    </span>
                    <div className="flex items-center gap-3 font-mono-num">
                      {dayIn > 0 && <span className="text-emerald-400">+{formatRupiah(dayIn)}</span>}
                      {dayOut > 0 && <span className="text-slate-300">{formatRupiah(dayOut)}</span>}
                    </div>
                  </div>

                  <div className="surface-card rounded-2xl divide-y divide-[var(--border-subtle)] overflow-hidden">
                    {items.map((tx) => {
                      const isIncome = tx.type === "income";
                      return (
                        <div
                          key={tx.id}
                          className="p-3.5 sm:px-4 flex items-center justify-between gap-3 text-xs group hover:bg-[var(--hover-tint)] transition"
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
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 transition border disabled:opacity-70 ${
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
                                {tx.createdAt && tx.timeKnown !== false ? (
                                  <>
                                    <span className="text-slate-300 font-mono-num">
                                      {new Date(tx.createdAt).toLocaleTimeString("id-ID", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        timeZone: "Asia/Jakarta",
                                      })}
                                    </span>
                                    <span>·</span>
                                  </>
                                ) : null}
                                <span>{tx.category}</span>
                                {wallets.length > 0 && (
                                  <>
                                    <span>·</span>
                                    <select
                                      aria-label={`Pindah sumber dana untuk ${tx.item}`}
                                      value={tx.walletId || ""}
                                      disabled={movingTxId === tx.id}
                                      onChange={(e) => handleChangeWallet(tx.id, e.target.value)}
                                      className="bg-[var(--bg-inset)] text-slate-200 border border-[var(--border-default)] rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-accent-500"
                                    >
                                      {!tx.walletId && <option value="">Pilih Dana</option>}
                                      {wallets.map((w) => (
                                        <option key={w.id} value={w.id}>
                                          {w.name}
                                        </option>
                                      ))}
                                    </select>
                                    {movingTxId === tx.id && (
                                      <Spinner className="w-3 h-3 text-accent-300" />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-semibold font-mono-num text-sm ${
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
                              title="Hapus Transaksi"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition"
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
                </div>
              );
            })
          )}
        </section>
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

export default function RiwayatPage() {
  return (
    <Suspense fallback={<DiabloScreenLoader subtitle="Memuat riwayat transaksi..." />}>
      <RiwayatContent />
    </Suspense>
  );
}
