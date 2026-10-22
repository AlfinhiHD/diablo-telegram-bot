"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { formatRupiah } from "@/lib/format";
import {
  SlidersHorizontal,
  Wallet,
  Calendar,
  CreditCard,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  LogOut,
  Send,
  PiggyBank,
} from "lucide-react";

function AturContent() {
  const searchParams = useSearchParams();
  const isFirstTime = searchParams.get("first") === "1";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Form states
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [paydayDate, setPaydayDate] = useState("25");
  const [fixedCosts, setFixedCosts] = useState([]);

  // New fixed cost input
  const [newCostName, setNewCostName] = useState("");
  const [newCostAmount, setNewCostAmount] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/diablo");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (res.ok) {
        setData(json);
        const p = json.profile || {};
        setMonthlyIncome(p.monthlyIncome || "");
        setPaydayDate(String(p.paydayDate || "25"));
        setFixedCosts(p.fixedCosts || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleAddFixedCost(e) {
    e.preventDefault();
    if (!newCostName.trim() || !newCostAmount) return;

    const newCost = {
      id: "fc_" + Date.now(),
      name: newCostName.trim(),
      amount: Number(newCostAmount) || 0,
    };

    setFixedCosts([...fixedCosts, newCost]);
    setNewCostName("");
    setNewCostAmount("");
  }

  function handleRemoveFixedCost(id) {
    setFixedCosts(fixedCosts.filter((c) => c.id !== id));
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const patch = {
        monthlyIncome: Number(monthlyIncome) || 0,
        paydayDate: Math.min(28, Math.max(1, Number(paydayDate) || 25)),
        fixedCosts: fixedCosts.map((c) => ({
          ...c,
          amount: Number(c.amount) || 0,
        })),
      };

      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          profile: patch,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Gagal menyimpan");

      setSaveSuccess(true);
      await loadData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-fintech-canvas flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const totalFixed = fixedCosts.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const pots = data?.profile?.savingsPots || [];
  const totalMonthlySavings = pots.reduce((acc, p) => acc + (Number(p.monthlyAllocation) || 0), 0);
  const netDiscretionary = Math.max(
    0,
    (Number(monthlyIncome) || 0) - totalFixed - totalMonthlySavings
  );

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} />

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-100">
            Pengaturan Pundi-pundi
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Konfigurasi pendapatan bulanan, siklus gajian, dan komitmen keuangan
          </p>
        </div>

        {isFirstTime && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-300">
              <strong className="block text-emerald-200 mb-0.5 font-semibold">
                Selamat Datang di Diablo Finance, Tuan!
              </strong>
              Silakan lengkapi nominal pendapatan dan tanggal gajian di bawah ini agar
              Diablo dapat mengawal keuangan Tuan dengan akurat.
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Pengaturan pundi-pundi berhasil diperbarui.</span>
          </div>
        )}

        {saveError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>{saveError}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* BAGIAN 1: Gaji & Tanggal Gajian */}
          <section className="bento-card rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              1. Pendapatan & Siklus Gajian
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Pendapatan / Gaji Bulanan (Rp)
                </label>
                <input
                  type="number"
                  required
                  placeholder="Contoh: 10000000"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Total pemasukan bersih bulanan Tuan.
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Tanggal Gajian Setiap Bulan (1 - 28)
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  required
                  placeholder="25"
                  value={paydayDate}
                  onChange={(e) => setPaydayDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Awal siklus perhitungan budget harian Diablo.
                </p>
              </div>
            </div>
          </section>

          {/* BAGIAN 2: Tagihan Tetap (Fixed Costs) */}
          <section className="bento-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                2. Tagihan Tetap (Fixed Costs)
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                Total: <strong className="text-slate-200">{formatRupiah(totalFixed)}</strong>
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Biaya wajib bulanan yang harus dibayar (Kos/KPR, WiFi, Listrik, Asuransi, dsb).
              Uang ini langsung dipisahkan dari jatah harian.
            </p>

            {/* List Existing Fixed Costs */}
            <div className="space-y-2">
              {fixedCosts.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl">
                  Belum ada tagihan tetap. Tambahkan di bawah.
                </div>
              ) : (
                fixedCosts.map((cost) => (
                  <div
                    key={cost.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-slate-200">{cost.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-300 font-semibold">
                        {formatRupiah(cost.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFixedCost(cost.id)}
                        className="text-slate-500 hover:text-rose-400 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Form Tambah Tagihan Tetap */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <input
                  type="text"
                  placeholder="Nama tagihan (misal: Kos, Wifi)"
                  value={newCostName}
                  onChange={(e) => setNewCostName(e.target.value)}
                  className="sm:col-span-3 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  placeholder="Nominal (Rp)"
                  value={newCostAmount}
                  onChange={(e) => setNewCostAmount(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleAddFixedCost}
                disabled={!newCostName.trim() || !newCostAmount}
                className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Tagihan ke Daftar
              </button>
            </div>
          </section>

          {/* BAGIAN 3: Ringkasan Simulasi Alokasi */}
          <section className="bento-subcard rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Simulasi Alokasi Bulanan Tuan
            </h3>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Pendapatan Kotor:</span>
                <span className="font-mono text-slate-200">
                  {formatRupiah(Number(monthlyIncome) || 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tagihan Tetap (Wajib):</span>
                <span className="font-mono text-rose-400">
                  - {formatRupiah(totalFixed)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Alokasi Pos Tabungan:</span>
                <span className="font-mono text-blue-400">
                  - {formatRupiah(totalMonthlySavings)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between font-semibold text-slate-200">
                <span>Sisa Bebas Pakai Bulanan:</span>
                <span className="font-mono text-emerald-400 text-sm">
                  {formatRupiah(netDiscretionary)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
              Sisa bebas pakai di atas dibagi dengan sisa hari dalam siklus gajian untuk
              menentukan <strong>Jatah Aman Harian</strong> Tuan.
            </p>
          </section>

          {/* Action Save Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
            >
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </form>

        {/* BAGIAN 4: Akun & Logout */}
        <section className="bento-card rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Akun & Keamanan
          </h2>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div>
              <span className="block text-slate-300 font-medium">Telegram User ID</span>
              <span className="font-mono text-[11px] text-slate-500">
                {data?.userId || "-"}
              </span>
            </div>

            <form action="/auth/logout" method="POST">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar dari Web</span>
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function AturPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#020617] flex items-center justify-center text-slate-400 text-sm">
          Memuat...
        </div>
      }
    >
      <AturContent />
    </Suspense>
  );
}
