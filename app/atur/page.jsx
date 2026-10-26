"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import DiabloAvatar from "@/components/DiabloAvatar";
import { useDiabloData } from "@/lib/diablo-client";
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
  User,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

function AturContent() {
  const searchParams = useSearchParams();
  const isFirstTime = searchParams.get("first") === "1";

  const { data, loading, reload, setData } = useDiabloData();

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Form states
  const [ownerName, setOwnerName] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [paydayDate, setPaydayDate] = useState("25");
  const [fixedCosts, setFixedCosts] = useState([]);

  // New fixed cost input
  const [newCostName, setNewCostName] = useState("");
  const [newCostAmount, setNewCostAmount] = useState("");

  // Sync form state whenever data is available/updated
  useEffect(() => {
    if (data?.profile) {
      const p = data.profile;
      setOwnerName(p.ownerName || (data.userId === "1128526190" ? "Alfin" : ""));
      setMonthlyIncome(p.monthlyIncome || "");
      setPaydayDate(String(p.paydayDate || "25"));
      setFixedCosts(p.fixedCosts || []);
    }
  }, [data]);

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
        ownerName: ownerName.trim(),
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
      await reload();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const totalFixed = fixedCosts.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const pots = data?.profile?.savingsPots || [];
  const totalMonthlySavings = pots.reduce((acc, p) => acc + (Number(p.monthly) || 0), 0);
  const netDiscretionary = Math.max(
    0,
    (Number(monthlyIncome) || 0) - totalFixed - totalMonthlySavings
  );

  const displayName = ownerName || data?.profile?.ownerName || (data?.userId === "1128526190" ? "Alfin" : "Tuan");
  const telegramHandle = data?.profile?.telegramUsername || (data?.userId === "1128526190" ? "nocelestial14" : "");

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} profile={data?.profile} />

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100 flex items-center gap-2">
              <span>Pengaturan Pundi-pundi</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Kelola identitas, pendapatan bulanan, siklus gajian, dan tagihan tetap
            </p>
          </div>
          <DiabloAvatar className="w-10 h-10 hidden sm:inline-flex" />
        </div>

        {isFirstTime && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-300">
              <strong className="block text-emerald-200 mb-0.5 font-semibold">
                Selamat Datang di Diablo Finance, Tuan!
              </strong>
              Silakan lengkapi nama panggilan, nominal pendapatan, dan tanggal gajian di bawah ini agar
              Diablo dapat mengawal keuangan Tuan dengan akurat.
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Pengaturan pundi-pundi berhasil diperbarui.</span>
          </div>
        )}

        {saveError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* BAGIAN 1: Profil & Identitas Tuan */}
          <section className="bento-card rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              1. Identitas & Panggilan
            </h2>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nama Panggilan Tuan
              </label>
              <input
                type="text"
                placeholder="Contoh: Alfin"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Panggilan yang digunakan Diablo saat menyapa Tuan di Dashboard dan Telegram.
              </p>
            </div>
          </section>

          {/* BAGIAN 2: Gaji & Siklus Gajian (Custom Stepper Inputs) */}
          <section className="bento-card rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              2. Pendapatan & Siklus Gajian
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Input Gaji dengan Custom Controls */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400 font-medium">
                    Gaji Bulanan (Rp)
                  </label>
                  {monthlyIncome > 0 && (
                    <span className="text-xs text-emerald-400 font-mono font-semibold">
                      {formatRupiah(monthlyIncome)}
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="number"
                    required
                    placeholder="Contoh: 6000000"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    className="w-full pl-10 pr-20 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono font-semibold"
                  />
                  {/* Custom Up/Down Stepper Buttons */}
                  <div className="absolute right-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMonthlyIncome((v) => Math.max(0, (Number(v) || 0) - 500000))}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-300 hover:text-white flex items-center justify-center transition border border-slate-700/80"
                      title="Kurangi 500rb"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyIncome((v) => (Number(v) || 0) + 500000)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-300 hover:text-white flex items-center justify-center transition border border-slate-700/80"
                      title="Tambah 500rb"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick Increment Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-500 mr-0.5">Tambah:</span>
                  {[
                    { label: "+500rb", val: 500000 },
                    { label: "+1 Jt", val: 1000000 },
                    { label: "+2 Jt", val: 2000000 },
                    { label: "+5 Jt", val: 5000000 },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setMonthlyIncome((v) => (Number(v) || 0) + chip.val)}
                      className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-emerald-500/20 hover:text-emerald-300 text-[10px] text-slate-400 font-mono transition border border-slate-700/60"
                    >
                      {chip.label}
                    </button>
                  ))}
                  {Number(monthlyIncome) > 0 && (
                    <button
                      type="button"
                      onClick={() => setMonthlyIncome(0)}
                      className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 text-[10px] text-slate-500 transition border border-slate-700/60"
                    >
                      Kosongkan
                    </button>
                  )}
                </div>
              </div>

              {/* Input Tanggal Gajian dengan Custom Decrement/Increment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400 font-medium">
                    Tanggal Gajian (1 - 28)
                  </label>
                  <span className="text-xs text-slate-400 font-mono">
                    Siklus: Tgl {paydayDate}
                  </span>
                </div>

                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setPaydayDate((v) => String(Math.max(1, (Number(v) || 25) - 1)))}
                    className="w-10 h-10 rounded-l-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center transition text-sm font-bold border-y border-l border-slate-700"
                    title="Kurangi tanggal"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    required
                    placeholder="25"
                    value={paydayDate}
                    onChange={(e) => setPaydayDate(e.target.value)}
                    className="w-full py-2 bg-slate-900 border-y border-slate-700 text-center text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setPaydayDate((v) => String(Math.min(28, (Number(v) || 25) + 1)))}
                    className="w-10 h-10 rounded-r-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center transition text-sm font-bold border-y border-r border-slate-700"
                    title="Tambah tanggal"
                  >
                    +
                  </button>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-500 mr-0.5">Pilihan umum:</span>
                  {["25", "28", "1"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPaydayDate(d)}
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono transition border ${
                        String(paydayDate) === d
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold"
                          : "bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-700"
                      }`}
                    >
                      Tgl {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* BAGIAN 3: Tagihan Tetap (Fixed Costs) */}
          <section className="bento-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                3. Tagihan Tetap (Fixed Costs)
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
                        className="text-slate-500 hover:text-rose-400 p-0.5 transition"
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
                <div className="sm:col-span-2 relative flex items-center">
                  <span className="absolute left-2.5 text-[11px] font-mono text-slate-500 pointer-events-none">Rp</span>
                  <input
                    type="number"
                    placeholder="Nominal"
                    value={newCostAmount}
                    onChange={(e) => setNewCostAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
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

          {/* BAGIAN 4: Ringkasan Simulasi Alokasi */}
          <section className="bento-subcard rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Simulasi Alokasi Bulanan Tuan
            </h3>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Pendapatan Bulanan:</span>
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
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
            >
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </form>

        {/* BAGIAN 5: Akun, Identitas & Keamanan */}
        <section className="bento-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Akun & Koneksi Telegram
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Aktif Terhubung
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <DiabloAvatar className="w-12 h-12" showBadge={true} />
              <div>
                <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <span>{displayName}</span>
                  {telegramHandle && (
                    <span className="text-xs text-slate-400 font-mono font-normal">
                      (@{telegramHandle})
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                  <span>ID: {data?.userId || "-"}</span>
                  <span className="text-slate-600">•</span>
                  <span>Siklus: Tgl {paydayDate}</span>
                </div>
              </div>
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
