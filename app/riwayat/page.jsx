"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, groupTransactionsByDate } from "@/lib/format";
import { Search, Trash2, ReceiptText, Wallet } from "lucide-react";

function RiwayatContent() {
  const searchParams = useSearchParams();
  const initialWallet = searchParams.get("wallet") || "ALL";

  const { data, reload } = useDiabloData();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [filterWallet, setFilterWallet] = useState(initialWallet);
  const [filterIntent, setFilterIntent] = useState("ALL"); // ALL, INCOME, NEED, WANT, GIFT, ASSET
  const [searchQuery, setSearchQuery] = useState("");
  const [movingTxId, setMovingTxId] = useState(null);

  useEffect(() => {
    const qW = searchParams.get("wallet");
    if (qW) setFilterWallet(qW);
  }, [searchParams]);

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

  const transactions = data?.transactions || [];
  const wallets = data?.profile?.wallets || [];

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
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
  }, [transactions, filterWallet, filterIntent, searchQuery]);

  const grouped = useMemo(() => groupTransactionsByDate(filtered), [filtered]);

  const totalOut = filtered
    .filter((t) => (t.type || "expense") !== "income")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const totalIn = filtered
    .filter((t) => t.type === "income")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const selectedWalletObj = wallets.find((w) => w.id === filterWallet);

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav
        userId={data?.userId}
        profile={data?.profile}
        onQuickLog={() => setQuickLogOpen(true)}
      />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Riwayat Transaksi
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedWalletObj
                ? `Riwayat khusus dana ${selectedWalletObj.name} • Saldo saat ini ${formatRupiah(selectedWalletObj.balance)}`
                : "Riwayat terpisah per sumber dana, pengeluaran, dan pemasukan Tuan"}
            </p>
          </div>

          <div className="flex items-center gap-4 text-right">
            {totalIn > 0 && (
              <div>
                <span className="text-[10px] text-slate-400 block">Total Masuk</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  +{formatRupiah(totalIn)}
                </span>
              </div>
            )}
            <div>
              <span className="text-[10px] text-slate-400 block">Total Keluar</span>
              <span className="text-lg font-bold font-mono text-slate-100">
                {formatRupiah(totalOut)}
              </span>
            </div>
          </div>
        </div>

        {/* WALLET TABS: History Terpisah per Sumber Dana */}
        {wallets.length > 0 && (
          <section className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterWallet("ALL")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition border flex items-center gap-1.5 ${
                filterWallet === "ALL"
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm"
                  : "bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700"
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Semua Dana</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterWallet === "ALL" ? "bg-slate-950/20" : "bg-slate-800 text-slate-400"}`}>
                {transactions.length}
              </span>
            </button>
            {wallets.map((w) => {
              const count = transactions.filter((t) => t.walletId === w.id).length;
              const active = filterWallet === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setFilterWallet(w.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition border flex items-center gap-1.5 ${
                    active
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm"
                      : "bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span>{w.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${active ? "bg-slate-950/20" : "bg-slate-800 text-slate-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </section>
        )}

        {/* Filter & Search Bar */}
        <section className="bento-card rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari transaksi (misal: kopi, mousepad, ngamen)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            {["ALL", "INCOME", "NEED", "WANT", "GIFT", "ASSET"].map((intent) => {
              const active = filterIntent === intent;
              const label = intent === "ALL" ? "Semua" : intent === "INCOME" ? "Masuk" : intent;
              return (
                <button
                  key={intent}
                  onClick={() => setFilterIntent(intent)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    active
                      ? "bg-emerald-500 text-slate-950 shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* List of Grouped Transactions */}
        <section className="space-y-6">
          {filtered.length === 0 ? (
            <div className="bento-card rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ReceiptText className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  {searchQuery || filterIntent !== "ALL" || filterWallet !== "ALL"
                    ? "Tidak Ada Transaksi Sesuai Filter"
                    : "Belum Ada Catatan Transaksi"}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {searchQuery || filterIntent !== "ALL" || filterWallet !== "ALL"
                    ? "Coba pindah tab sumber dana atau ubah kata kunci pencarian."
                    : "Ketik pengeluaran/pemasukan di bot Telegram atau klik + Catat di atas."}
                </p>
              </div>
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
                  <div className="flex items-center justify-between px-2 text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">{dateLabel}</span>
                    <div className="flex items-center gap-3 font-mono">
                      {dayIn > 0 && <span className="text-emerald-400">+{formatRupiah(dayIn)}</span>}
                      {dayOut > 0 && <span className="text-slate-400">{formatRupiah(dayOut)}</span>}
                    </div>
                  </div>

                  <div className="bento-card rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
                    {items.map((tx) => {
                      const isIncome = tx.type === "income";
                      return (
                        <div
                          key={tx.id}
                          className="p-3.5 sm:px-4 flex items-center justify-between gap-3 text-xs group hover:bg-slate-900/30 transition"
                        >
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
                                {tx.createdAt && tx.timeKnown !== false ? (
                                  <>
                                    <span className="text-slate-400 font-mono">
                                      {new Date(tx.createdAt).toLocaleTimeString("id-ID", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        timeZone: "Asia/Jakarta",
                                      })}
                                    </span>
                                    <span>•</span>
                                  </>
                                ) : null}
                                <span>{tx.category}</span>
                                {wallets.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <select
                                      value={tx.walletId || ""}
                                      disabled={movingTxId === tx.id}
                                      onChange={(e) => handleChangeWallet(tx.id, e.target.value)}
                                      title="Pindah sumber dana"
                                      className="bg-slate-800/90 text-slate-300 border border-slate-700/80 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-emerald-500 cursor-pointer"
                                    >
                                      {!tx.walletId && <option value="">Pilih Dana</option>}
                                      {wallets.map((w) => (
                                        <option key={w.id} value={w.id}>
                                          {w.name}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`font-semibold font-mono-num text-sm ${
                                isIncome ? "text-emerald-400" : "text-slate-100"
                              }`}
                            >
                              {isIncome ? `+${formatRupiah(tx.amount)}` : formatRupiah(tx.amount)}
                            </span>
                            <button
                              onClick={() => handleDeleteTx(tx.id)}
                              title="Hapus Transaksi"
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      />
    </div>
  );
}

export default function RiwayatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-fintech-canvas flex items-center justify-center text-slate-400 text-xs">
          Memuat riwayat...
        </div>
      }
    >
      <RiwayatContent />
    </Suspense>
  );
}
