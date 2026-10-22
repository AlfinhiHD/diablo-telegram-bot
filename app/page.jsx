"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { formatRupiah, formatShortDate } from "@/lib/format";
import {
  Wallet,
  PiggyBank,
  TrendingDown,
  Calendar,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
  RefreshCw,
  Plus,
} from "lucide-react";

export default function HomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diablo");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data");
      setData(json);
    } catch (err) {
      setError(err.message);
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
    if (!confirm("Hapus transaksi ini?")) return;
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

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3" />
        <p className="text-xs text-slate-400">Menghubungkan ke pundi-pundi Tuan...</p>
      </div>
    );
  }

  const profile = data?.profile;
  const analytics = data?.analytics;
  const transactions = data?.transactions || [];
  const recentTx = transactions.slice(0, 5);

  const isConfigured = profile && profile.monthlyIncome > 0;
  const todayRemaining = analytics?.budget?.todayRemaining ?? 0;
  const isOverbudget = todayRemaining < 0;

  // Total tabungan terkumpul di semua pos
  const totalSavedInPots = (profile?.savingsPots || []).reduce(
    (acc, p) => acc + (Number(p.saved) || 0),
    0
  );

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} onQuickLog={() => setQuickLogOpen(true)} />

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Onboarding Alert jika belum setup gaji */}
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

        {/* HERO CARD: 1 Pertanyaan Utama "Berapa boleh kupakai hari ini?" */}
        <section className="bento-card rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
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
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {analytics?.cycle?.daysRemaining ?? 0} hari ke gajian (tgl {profile?.paydayDate || 25})
              </span>
            </div>
          </div>

          {/* Primary Big Metric */}
          <div className="flex items-baseline gap-2">
            <h1
              className={`text-4xl sm:text-5xl font-extrabold tracking-tight font-heading ${
                isOverbudget ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {formatRupiah(todayRemaining)}
            </h1>
          </div>

          {/* Breakdown description */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-4">
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
            </div>

            <button
              onClick={() => setQuickLogOpen(true)}
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Catat Pengeluaran
            </button>
          </div>
        </section>

        {/* 2 BENTO SUB-CARDS: Sisa Budget Siklus & Pos Tabungan */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card A: Sisa Budget Siklus */}
          <div className="bento-subcard rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Sisa Budget Siklus</span>
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold font-heading text-slate-100">
                {formatRupiah(analytics?.budget?.remainingBudget ?? 0)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Dari alokasi bebas pakai {formatRupiah(analytics?.budget?.cycleBudget ?? 0)}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Terpakai siklus ini</span>
              <span className="font-semibold text-slate-300">
                {formatRupiah(analytics?.budget?.cycleSpent ?? 0)}
              </span>
            </div>
          </div>

          {/* Card B: Pos Tabungan Terkumpul */}
          <Link
            href="/tabungan"
            className="bento-subcard rounded-2xl p-5 flex flex-col justify-between group hover:border-slate-700 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Pos Tabungan Terkumpul</span>
              <div className="flex items-center gap-1 text-emerald-400 group-hover:translate-x-0.5 transition">
                <PiggyBank className="w-4 h-4" />
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold font-heading text-emerald-400">
                {formatRupiah(totalSavedInPots)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Tersebar di {profile?.savingsPots?.length || 0} pos tabungan aktif
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Kelola pos tabungan</span>
              <span className="font-semibold text-emerald-400 flex items-center gap-0.5">
                Buka Tabungan <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        </section>

        {/* DIABLO SATIRE / BUTLER ADVISORY */}
        <section className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-xs leading-relaxed text-slate-300">
            <strong className="text-purple-300 font-semibold block mb-0.5">
              Komentar Diablo:
            </strong>
            {analytics?.projection?.isDanger ? (
              <span>
                &ldquo;Kukuku... Maaf Tuan, jika pola belanja berlanjut seperti ini, kas Tuan
                diproyeksikan habis dalam{" "}
                <span className="text-rose-400 font-bold">
                  {analytics.projection.daysUntilBroke} hari
                </span>
                . Mohon kencangkan ikat pinggang Tuan.&rdquo;
              </span>
            ) : isOverbudget ? (
              <span>
                &ldquo;Jatah hari ini sudah terlampaui sebesar{" "}
                <span className="text-rose-400 font-bold">
                  {formatRupiah(Math.abs(todayRemaining))}
                </span>
                . Jangan biarkan godaan nafsu sesaat meruntuhkan martabat dompet Tuan.&rdquo;
              </span>
            ) : (
              <span>
                &ldquo;Pundi-pundi Tuan masih aman dan terkendali. Kebutuhan pokok Tuan
                berada di porsi {analytics?.leakDetector?.needsPercent ?? 0}%, dan keinginan di{" "}
                {analytics?.leakDetector?.wantsPercent ?? 0}%. Pertahankan disiplin ini.&rdquo;
              </span>
            )}
          </div>
        </section>

        {/* 5 TRANSAKSI TERAKHIR */}
        <section className="bento-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              5 Transaksi Terakhir
            </h3>
            <Link
              href="/riwayat"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
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
              {recentTx.map((tx) => (
                <div
                  key={tx.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs group"
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
                        <span>•</span>
                        <span>{formatShortDate(tx.createdAt)}</span>
                        {tx.paymentMethod && (
                          <>
                            <span>•</span>
                            <span className="uppercase text-[9px] text-slate-400">
                              {tx.paymentMethod}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-slate-100 font-mono-num">
                      {formatRupiah(tx.amount)}
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
              ))}
            </div>
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
