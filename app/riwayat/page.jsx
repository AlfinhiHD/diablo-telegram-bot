"use client";

import { useState, useMemo } from "react";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah, formatShortDate, groupTransactionsByDate } from "@/lib/format";
import {
  Search,
  Filter,
  Trash2,
  Calendar,
  CreditCard,
  Tag,
  ArrowUpDown,
  ReceiptText,
} from "lucide-react";

export default function RiwayatPage() {
  const { data, loading, reload } = useDiabloData();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [filterIntent, setFilterIntent] = useState("ALL"); // ALL, NEED, WANT
  const [searchQuery, setSearchQuery] = useState("");

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
    if (!confirm("Hapus catatan transaksi ini?")) return;
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

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchesIntent =
        filterIntent === "ALL" || t.intent === filterIntent;
      const matchesSearch =
        !searchQuery.trim() ||
        t.item.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.category || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesIntent && matchesSearch;
    });
  }, [transactions, filterIntent, searchQuery]);

  const grouped = useMemo(() => {
    return groupTransactionsByDate(filtered);
  }, [filtered]);

  const totalFilteredAmount = filtered.reduce(
    (acc, t) => acc + (Number(t.amount) || 0),
    0
  );

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
              Riwayat Pengeluaran
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Seluruh catatan transaksi, struk foto, dan klasifikasi Needs vs Wants
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Total Ditampilkan</span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              {formatRupiah(totalFilteredAmount)}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <section className="bento-card rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari transaksi (misal: kopi, bensin, jus)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {["ALL", "NEED", "WANT"].map((intent) => {
              const active = filterIntent === intent;
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
                  {intent === "ALL" ? "Semua" : intent}
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
                  {searchQuery || filterIntent !== "ALL"
                    ? "Tidak Ada Transaksi Sesuai Filter"
                    : "Belum Ada Catatan Transaksi"}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {searchQuery || filterIntent !== "ALL"
                    ? "Coba sesuaikan kata kunci pencarian atau ubah filter Need / Want."
                    : "Ketik pengeluaran di bot Telegram (misal: kopi 25k) atau klik tombol + Catat di atas."}
                </p>
              </div>
            </div>
          ) : (
            grouped.map(([dateLabel, items]) => {
              const dayTotal = items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
              return (
                <div key={dateLabel} className="space-y-2">
                  <div className="flex items-center justify-between px-2 text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">{dateLabel}</span>
                    <span className="font-mono text-slate-400">{formatRupiah(dayTotal)}</span>
                  </div>

                  <div className="bento-card rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
                    {items.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3.5 sm:px-4 flex items-center justify-between gap-3 text-xs group hover:bg-slate-900/30 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => handleToggleIntent(tx.id)}
                            title="Klik untuk ubah NEED / WANT"
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 transition ${
                              tx.intent === "NEED"
                                ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                                : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                            }`}
                          >
                            {tx.intent}
                          </button>

                          <div className="min-w-0">
                            <div className="font-medium text-slate-200 truncate">
                              {tx.item}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>{tx.category}</span>
                              {tx.paymentMethod && (
                                <>
                                  <span>•</span>
                                  <span className="uppercase text-[9px] text-slate-400">
                                    {tx.paymentMethod}
                                  </span>
                                </>
                              )}
                              {tx.source && (
                                <>
                                  <span>•</span>
                                  <span className="text-[9px] text-slate-500">
                                    via {tx.source}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-semibold text-slate-100 font-mono-num text-sm">
                            {formatRupiah(tx.amount)}
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
                    ))}
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
      />
    </div>
  );
}
