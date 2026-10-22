"use client";

import { useEffect, useState, useMemo } from "react";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { formatRupiah, formatShortDate, groupTransactionsByDate } from "@/lib/format";
import {
  Search,
  Filter,
  Trash2,
  Calendar,
  CreditCard,
  Tag,
  ArrowUpDown,
} from "lucide-react";

export default function RiwayatPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [filterIntent, setFilterIntent] = useState("ALL"); // ALL, NEED, WANT
  const [searchQuery, setSearchQuery] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/diablo");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleToggleIntent(txId) {
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_intent", txId }),
      });
      if (res.ok) loadData();
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
      if (res.ok) loadData();
    } catch (e) {
      console.error(e);
    }
  }

  const transactions = data?.transactions || [];

  const filteredTx = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterIntent !== "ALL" && tx.intent !== filterIntent) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchItem = (tx.item || "").toLowerCase().includes(q);
        const matchCat = (tx.category || "").toLowerCase().includes(q);
        if (!matchItem && !matchCat) return false;
      }
      return true;
    });
  }, [transactions, filterIntent, searchQuery]);

  const grouped = useMemo(() => {
    return groupTransactionsByDate(filteredTx);
  }, [filteredTx]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} onQuickLog={() => setQuickLogOpen(true)} />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-100">
            Riwayat Transaksi
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Daftar pengeluaran yang dicatat via Telegram & Web
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari transaksi atau kategori..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* Intent Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 shrink-0">
            {[
              { id: "ALL", label: "Semua" },
              { id: "NEED", label: "Needs" },
              { id: "WANT", label: "Wants" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterIntent(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  filterIntent === tab.id
                    ? "bg-slate-800 text-slate-100 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Groups */}
        <section className="space-y-6">
          {grouped.length === 0 ? (
            <div className="bento-card rounded-2xl p-12 text-center text-xs text-slate-500">
              Tidak ada transaksi yang cocok dengan filter.
            </div>
          ) : (
            grouped.map(([dateLabel, items]) => {
              const dayTotal = items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

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
        onSuccess={() => loadData()}
      />
    </div>
  );
}
