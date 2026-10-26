"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import QuickLogModal from "@/components/QuickLogModal";
import { useDiabloData } from "@/lib/diablo-client";
import { formatRupiah } from "@/lib/format";
import {
  PiggyBank,
  Plus,
  Trash2,
  Edit2,
  TrendingUp,
  Sparkles,
  CheckCircle,
} from "lucide-react";

export default function TabunganPage() {
  const { data, loading, reload } = useDiabloData();
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  // Modal / Form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [newPotTarget, setNewPotTarget] = useState("");
  const [newPotSaved, setNewPotSaved] = useState("");
  const [newPotMonthly, setNewPotMonthly] = useState("");

  // Top up state
  const [topUpPotId, setTopUpPotId] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const pots = data?.profile?.savingsPots || [];
  const totalSaved = pots.reduce((acc, p) => acc + (Number(p.saved) || 0), 0);
  const totalTarget = pots.reduce((acc, p) => acc + (Number(p.target) || 0), 0);
  const totalProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

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
        monthlyAllocation: Number(newPotMonthly) || 0,
      };

      const updatedPots = [...pots, newPot];
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_pots",
          pots: updatedPots,
        }),
      });

      if (res.ok) {
        setNewPotName("");
        setNewPotTarget("");
        setNewPotSaved("");
        setNewPotMonthly("");
        setIsAddOpen(false);
        await reload();
      }
    } catch (err) {
      alert("Gagal menambahkan pos tabungan: " + err.message);
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
        body: JSON.stringify({
          action: "add_to_pot",
          potId: topUpPotId,
          amount: Number(topUpAmount) || 0,
        }),
      });

      if (res.ok) {
        setTopUpPotId(null);
        setTopUpAmount("");
        await reload();
      } else {
        const err = await res.json();
        alert(err.error || "Gagal mengisi tabungan");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeletePot(potId) {
    if (!confirm("Hapus pos tabungan ini? Saldo tercatat akan dihilangkan.")) return;
    try {
      const updatedPots = pots.filter((p) => p.id !== potId);
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_pots",
          pots: updatedPots,
        }),
      });
      if (res.ok) await reload();
    } catch (e) {
      console.error(e);
    }
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

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
              Kelola Pos Tabungan A, B, C (Dana Darurat, Gadget, Liburan, Investasi)
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Pos Baru</span>
          </button>
        </div>

        {/* Hero Card: Total Tabungan */}
        <section className="bento-card rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Seluruh Tabungan
            </span>
            <span className="text-xs font-bold text-emerald-400">
              {totalProgress}% dari Target
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div className="text-3xl sm:text-4xl font-extrabold font-heading text-emerald-400">
              {formatRupiah(totalSaved)}
            </div>
            <div className="text-xs text-slate-400">
              Target akumulasi:{" "}
              <strong className="text-slate-200">{formatRupiah(totalTarget)}</strong>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </section>

        {/* Telegram Shortcut Hint */}
        <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3 text-xs text-emerald-300/90">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Tips Bot:</strong> Tuan bisa menabung instan lewat Telegram dengan format{" "}
            <code className="px-1.5 py-0.5 rounded bg-emerald-950/60 font-mono text-emerald-300">
              /nabung &lt;nama pos&gt; &lt;nominal&gt;
            </code>{" "}
            (misal: <code className="font-mono">/nabung darurat 200rb</code>).
          </span>
        </div>

        {/* List of Pots */}
        <section className="space-y-4">
          {pots.length === 0 ? (
            <div className="bento-card rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <PiggyBank className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                Belum Ada Pos Tabungan
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Buat pos tabungan pertama Tuan untuk memisahkan dana darurat, tabungan liburan, atau target barang impian.
              </p>
              <button
                onClick={() => setIsAddOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs"
              >
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
                  <div
                    key={pot.id}
                    className="bento-card rounded-2xl p-5 space-y-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-100 text-sm">
                            {pot.name}
                          </h3>
                          {pot.monthlyAllocation > 0 && (
                            <span className="text-[10px] text-slate-400">
                              Alokasi: {formatRupiah(pot.monthlyAllocation)}/bulan
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleDeletePot(pot.id)}
                          title="Hapus Pos"
                          className="text-slate-500 hover:text-rose-400 p-1 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between text-xs">
                        <span className="text-base font-bold font-heading text-emerald-400">
                          {formatRupiah(saved)}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          Target: {formatRupiah(target)}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-2 w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-right text-[10px] text-slate-500 font-mono">
                        {pct}% tercapai
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <button
                        onClick={() => {
                          setTopUpPotId(pot.id);
                          setTopUpAmount("");
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span>+ Isi Tabungan</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* MODAL: Tambah Pos Baru */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-md bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">
                Tambah Pos Tabungan Baru
              </h3>

              <form onSubmit={handleAddPot} className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nama Pos Tabungan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Dana Darurat, Gadget, Liburan"
                    value={newPotName}
                    onChange={(e) => setNewPotName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Target Nominal (Rp)
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="10000000"
                      value={newPotTarget}
                      onChange={(e) => setNewPotTarget(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Saldo Awal (Rp)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newPotSaved}
                      onChange={(e) => setNewPotSaved(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Alokasi Bulanan (Opsional, Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="Contoh: 500000"
                    value={newPotMonthly}
                    onChange={(e) => setNewPotMonthly(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Alokasi bulanan akan otomatis disisihkan dari gaji saat menghitung jatah harian bebas pakai.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
                  >
                    {actionLoading ? "Menyimpan..." : "Simpan Pos"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Isi Tabungan (Top Up) */}
        {topUpPotId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bento-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold font-heading text-slate-100">
                Isi Tabungan: {pots.find((p) => p.id === topUpPotId)?.name}
              </h3>

              <form onSubmit={handleTopUp} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nominal Tambahan (Rp)
                  </label>
                  <input
                    type="number"
                    autoFocus
                    required
                    placeholder="Contoh: 250000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTopUpPotId(null)}
                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || !topUpAmount}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
                  >
                    {actionLoading ? "Menyetor..." : "Setor Tabungan"}
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
      />
    </div>
  );
}
