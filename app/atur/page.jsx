"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import DiabloAvatar from "@/components/DiabloAvatar";
import { PageSkeleton, DiabloScreenLoader, Spinner } from "@/components/DiabloLoader";
import { useDiabloData, logoutSession } from "@/lib/diablo-client";
import { formatRupiah } from "@/lib/format";
import { computeNetMonthlySavings } from "@/lib/period-report";
import {
  DEFAULT_AGENT,
  AGENT_STYLE_OPTIONS,
  normalizeAgent,
  buildAgentPreview,
} from "@/lib/agent-persona";
import {
  Wallet,
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
  MessageSquare,
} from "lucide-react";

function AturContent() {
  const searchParams = useSearchParams();
  const isFirstTime = searchParams.get("first") === "1";

  const { data, loading, reload } = useDiabloData();
  const [mounted, setMounted] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [ownerName, setOwnerName] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [paydayDate, setPaydayDate] = useState("25");
  const [fixedCosts, setFixedCosts] = useState([]);

  const [agentName, setAgentName] = useState(DEFAULT_AGENT.name);
  const [agentUserCall, setAgentUserCall] = useState(DEFAULT_AGENT.userCall);
  const [agentStyle, setAgentStyle] = useState(DEFAULT_AGENT.style);
  const [agentCustomPrompt, setAgentCustomPrompt] = useState(DEFAULT_AGENT.customPrompt);

  const [newCostName, setNewCostName] = useState("");
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newCostDueDay, setNewCostDueDay] = useState("");
  const [newCostCycle, setNewCostCycle] = useState("1");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (data?.profile) {
      const p = data.profile;
      setOwnerName(p.ownerName || (data.userId === "1128526190" ? "Alfin" : ""));
      setMonthlyIncome(p.monthlyIncome || "");
      setPaydayDate(String(p.paydayDate || "25"));
      setFixedCosts(p.fixedCosts || []);

      const ag = normalizeAgent(p.agent);
      setAgentName(ag.name);
      setAgentUserCall(ag.userCall);
      setAgentStyle(ag.style);
      setAgentCustomPrompt(ag.customPrompt);
    }
  }, [data]);

  function handleAddFixedCost() {
    if (!newCostName.trim() || !newCostAmount) return;

    const cycleMonths = Math.max(1, Number(newCostCycle) || 1);
    const dueDayNum = Number(newCostDueDay);
    const newCost = {
      id: "fc_" + Date.now(),
      name: newCostName.trim(),
      amount: Number(newCostAmount) || 0,
      dueDay: dueDayNum >= 1 && dueDayNum <= 31 ? dueDayNum : null,
      cycleMonths,
      isSinkingFund: cycleMonths > 1,
    };

    setFixedCosts([...fixedCosts, newCost]);
    setNewCostName("");
    setNewCostAmount("");
    setNewCostDueDay("");
    setNewCostCycle("1");
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
        agent: normalizeAgent({
          name: agentName,
          userCall: agentUserCall,
          style: agentStyle,
          customPrompt: agentCustomPrompt,
        }),
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

  const incomeNum = Number(monthlyIncome) || 0;
  const totalFixed = fixedCosts.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const pots = data?.profile?.savingsPots || [];
  const { totalSavings: totalMonthlySavings, excludedSinkingPots } = computeNetMonthlySavings(fixedCosts, pots);
  const netDiscretionary = Math.max(0, incomeNum - totalFixed - totalMonthlySavings);
  const estDailySafe = Math.round(netDiscretionary / 30);

  const allocTotal = Math.max(1, incomeNum, totalFixed + totalMonthlySavings + netDiscretionary);
  const fixedPct = Math.round((totalFixed / allocTotal) * 100);
  const savePct = Math.round((totalMonthlySavings / allocTotal) * 100);
  const freePct = Math.max(0, 100 - fixedPct - savePct);

  const displayName =
    ownerName || data?.profile?.ownerName || (data?.userId === "1128526190" ? "Alfin" : "Tuan");
  const telegramHandle =
    data?.profile?.telegramUsername || (data?.userId === "1128526190" ? "nocelestial14" : "");

  const draftAgent = normalizeAgent({
    name: agentName,
    userCall: agentUserCall,
    style: agentStyle,
    customPrompt: agentCustomPrompt,
  });
  const liveAgentPreview = buildAgentPreview(draftAgent, displayName);

  if (!mounted || (loading && !data)) {
    return (
      <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
        <Nav />
        <PageSkeleton variant="atur" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fintech-canvas pb-24 sm:pb-12 text-slate-100">
      <Nav userId={data?.userId} profile={data?.profile} />

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-100">
              Pengaturan Pundi-pundi
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Kelola profil, personalisasi agen AI, pendapatan bulanan, siklus gajian, dan tagihan tetap.
            </p>
          </div>
          <DiabloAvatar className="w-10 h-10 hidden sm:inline-flex" />
        </div>

        {isFirstTime && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-emerald-300 leading-relaxed">
              <strong className="block text-emerald-200 mb-0.5 font-semibold">
                Selamat Datang di {draftAgent.name} Finance
              </strong>
              Lengkapi nama panggilan, nominal pendapatan, dan tanggal gajian di bawah agar jatah harian dapat dihitung akurat.
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>Pengaturan pundi-pundi dan personalisasi agen berhasil diperbarui.</span>
          </div>
        )}

        {saveError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>{saveError}</span>
          </div>
        )}

        {/* LIVE VISUAL ALLOCATION VAULT */}
        <section
          data-tone="accent"
          className="hero-vault rounded-2xl p-5 space-y-3.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Simulasi Alokasi Bulanan
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Estimasi jatah harian normal:{" "}
                <strong className="tabular-nums text-emerald-400">
                  ~{formatRupiah(estDailySafe)}/hari
                </strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Sisa Bebas Pakai</span>
              <span className="text-lg font-bold font-heading text-emerald-400">
                {formatRupiah(netDiscretionary)}
              </span>
            </div>
          </div>

          <div className="h-2.5 w-full rounded-full bg-[var(--bg-inset)] border border-[var(--border-subtle)] overflow-hidden flex">
            {fixedPct > 0 && (
              <div style={{ width: `${fixedPct}%` }} className="bg-rose-400 chart-bar-fill" title="Tagihan Tetap" />
            )}
            {savePct > 0 && (
              <div style={{ width: `${savePct}%` }} className="bg-accent-500 chart-bar-fill" title="Alokasi Tabungan" />
            )}
            {freePct > 0 && (
              <div style={{ width: `${freePct}%` }} className="bg-emerald-400 chart-bar-fill" title="Sisa Bebas Pakai" />
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-slate-200">
            <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
              Gaji: <strong className="font-mono-num text-slate-100">{formatRupiah(incomeNum)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              Tagihan {fixedPct}%: <strong className="font-mono-num text-rose-300">{formatRupiah(totalFixed)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-500/10 border border-accent-500/20">
              <span className="w-2 h-2 rounded-full bg-accent-500 inline-block" />
              Tabungan {savePct}%: <strong className="font-mono-num text-accent-300">{formatRupiah(totalMonthlySavings)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Bebas {freePct}%
            </span>
          </div>

          {excludedSinkingPots.length > 0 && (
            <p className="text-[11px] text-slate-400">
              {excludedSinkingPots.map((x) => `${x.potName} (${formatRupiah(x.monthly)}/bln)`).join(", ")} sudah dihitung di Tagihan Tetap agar tidak terpotong dua kali.
            </p>
          )}
        </section>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          {/* Personalisasi Agen AI */}
          <section id="agen" className="surface-card rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-accent-300" aria-hidden="true" />
                <span>Personalisasi Agen AI</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Ubah nama asisten, cara menyapa kamu, dan gaya bahasanya di dashboard maupun advisor AI.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="agent-name" className="block text-xs text-slate-300 font-medium mb-1.5">
                  Nama Agen
                </label>
                <input
                  id="agent-name"
                  type="text"
                  maxLength={32}
                  placeholder="Contoh: Diablo, Jarvis, Rina"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-sm text-slate-100 focus:outline-none focus:border-accent-500 font-medium"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["Diablo", "Jarvis", "Rina", "Kael"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAgentName(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border pressable ${
                        agentName === preset
                          ? "bg-accent-500/20 text-accent-300 border-accent-500/40"
                          : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="agent-call" className="block text-xs text-slate-300 font-medium mb-1.5">
                  Panggilan ke Kamu
                </label>
                <input
                  id="agent-call"
                  type="text"
                  maxLength={24}
                  placeholder="Contoh: Tuan, Bos, Bro, Kak"
                  value={agentUserCall}
                  onChange={(e) => setAgentUserCall(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-sm text-slate-100 focus:outline-none focus:border-accent-500 font-medium"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { label: "Tuan", val: "Tuan" },
                    { label: "Bos", val: "Bos" },
                    { label: "Bro", val: "Bro" },
                    { label: "Kak", val: "Kak" },
                    { label: "Pakai Nama", val: "{nama}" },
                  ].map((chip) => (
                    <button
                      key={chip.val}
                      type="button"
                      onClick={() => setAgentUserCall(chip.val)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border pressable ${
                        agentUserCall === chip.val
                          ? "bg-accent-500/20 text-accent-300 border-accent-500/40"
                          : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs text-slate-300 font-medium">Gaya Bicara</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {AGENT_STYLE_OPTIONS.map((opt) => {
                  const active = agentStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAgentStyle(opt.id)}
                      className={`p-3 rounded-xl border text-left transition pressable ${
                        active
                          ? "bg-[var(--bg-active)] border-accent-500/50 text-slate-100"
                          : "bg-[var(--bg-inset)] border-[var(--border-subtle)] text-slate-300 hover:border-[var(--border-default)]"
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-100">{opt.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="agent-custom-prompt" className="block text-xs text-slate-300 font-medium mb-1.5">
                Instruksi Gaya Tambahan (Opsional)
              </label>
              <textarea
                id="agent-custom-prompt"
                rows={2}
                maxLength={260}
                placeholder="Misal: pakai bahasa Jawa halus, sering ingatkan target tabungan motor, atau jangan terlalu kaku."
                value={agentCustomPrompt}
                onChange={(e) => setAgentCustomPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-none"
              />
            </div>

            {/* Live Preview Bubble */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-default)] flex items-start gap-3">
              <DiabloAvatar className="w-8 h-8 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-accent-300">
                  Preview sapaan {draftAgent.name}
                </div>
                <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                  &ldquo;{liveAgentPreview}&rdquo;
                </p>
              </div>
            </div>
          </section>

          {/* Profil & Siklus Gajian */}
          <section className="surface-card rounded-2xl p-5 sm:p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-accent-300" aria-hidden="true" />
              <span>Profil &amp; Siklus Gajian</span>
            </h2>

            <div>
              <label htmlFor="owner-name" className="block text-xs text-slate-300 font-medium mb-1.5">
                Nama Panggilan
              </label>
              <input
                id="owner-name"
                type="text"
                placeholder="Contoh: Alfin"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-sm text-slate-100 focus:outline-none focus:border-accent-500 font-medium"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ditampilkan pada profil dan dipakai saat panggilan diset ke &ldquo;Pakai Nama&rdquo;.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 border-t border-[var(--border-subtle)]">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="monthly-income" className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                    <span>Gaji Bulanan (Rp)</span>
                  </label>
                  {incomeNum > 0 && (
                    <span className="text-xs text-emerald-400 font-mono-num font-semibold">
                      {formatRupiah(incomeNum)}
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-mono font-bold text-slate-400 pointer-events-none">
                    Rp
                  </span>
                  <input
                    id="monthly-income"
                    type="number"
                    required
                    placeholder="6000000"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    className="w-full pl-10 pr-20 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-sm text-slate-100 focus:outline-none focus:border-accent-500 font-mono-num font-semibold"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMonthlyIncome((v) => Math.max(0, (Number(v) || 0) - 500000))}
                      className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-300 hover:text-slate-100 flex items-center justify-center border border-[var(--border-default)] pressable"
                      aria-label="Kurangi 500 ribu"
                      title="Kurangi 500rb"
                    >
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyIncome((v) => (Number(v) || 0) + 500000)}
                      className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-300 hover:text-slate-100 flex items-center justify-center border border-[var(--border-default)] pressable"
                      aria-label="Tambah 500 ribu"
                      title="Tambah 500rb"
                    >
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
                      className="px-2 py-1 rounded-lg bg-[var(--bg-inset)] hover:bg-accent-500/20 hover:text-accent-300 text-[11px] text-slate-300 font-mono-num border border-[var(--border-subtle)] pressable"
                    >
                      {chip.label}
                    </button>
                  ))}
                  {incomeNum > 0 && (
                    <button
                      type="button"
                      onClick={() => setMonthlyIncome(0)}
                      className="px-2 py-1 rounded-lg bg-[var(--bg-inset)] hover:bg-rose-500/20 hover:text-rose-400 text-[11px] text-slate-400 border border-[var(--border-subtle)]"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="payday-date" className="text-xs text-slate-300 font-medium">
                    Tanggal Gajian (1 - 28)
                  </label>
                  <span className="text-xs text-slate-400 font-mono-num">Siklus: Tgl {paydayDate}</span>
                </div>

                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setPaydayDate((v) => String(Math.max(1, (Number(v) || 25) - 1)))}
                    className="w-10 h-10 rounded-l-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-200 flex items-center justify-center text-sm font-bold border-y border-l border-[var(--border-default)] pressable"
                    aria-label="Kurangi tanggal gajian"
                    title="Kurangi tanggal"
                  >
                    -
                  </button>
                  <input
                    id="payday-date"
                    type="number"
                    min="1"
                    max="28"
                    required
                    placeholder="25"
                    value={paydayDate}
                    onChange={(e) => setPaydayDate(e.target.value)}
                    className="w-full h-10 bg-[var(--bg-inset)] border-y border-[var(--border-default)] text-center text-sm text-slate-100 focus:outline-none focus:border-accent-500 font-mono-num font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setPaydayDate((v) => String(Math.min(28, (Number(v) || 25) + 1)))}
                    className="w-10 h-10 rounded-r-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] text-slate-200 flex items-center justify-center text-sm font-bold border-y border-r border-[var(--border-default)] pressable"
                    aria-label="Tambah tanggal gajian"
                    title="Tambah tanggal"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  {["25", "28", "1"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPaydayDate(d)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono-num border pressable ${
                        String(paydayDate) === d
                          ? "bg-accent-500/20 text-accent-300 border-accent-500/40 font-semibold"
                          : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                      }`}
                    >
                      Tgl {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Tagihan Tetap */}
          <section className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-accent-300" aria-hidden="true" />
                <span>Tagihan Tetap (Fixed Costs)</span>
              </h2>
              <span className="text-xs text-slate-400 font-mono-num">
                Total: <strong className="text-slate-100">{formatRupiah(totalFixed)}</strong>
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Biaya wajib berkala (Kos, WiFi, Listrik, Langganan) yang otomatis disisihkan dari jatah harian.
            </p>

            {fixedCosts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-xl">
                Belum ada tagihan tetap. Tambahkan di bawah.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] overflow-hidden">
                {fixedCosts.map((cost) => (
                  <div
                    key={cost.id}
                    className="p-3.5 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-100 block truncate">
                        {cost.name}
                      </span>
                      {(cost.dueDay || cost.nextDueDate || cost.cycleMonths > 1) && (
                        <span className="text-[11px] text-slate-400">
                          {cost.dueDay ? `Tgl ${cost.dueDay}` : ""}
                          {cost.cycleMonths > 1 ? ` · per ${cost.cycleMonths} bln` : " · Bulanan"}
                          {cost.nextDueDate ? ` · Berikutnya ${cost.nextDueDate}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono-num text-slate-200 font-semibold">
                        {formatRupiah(cost.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFixedCost(cost.id)}
                        aria-label={`Hapus tagihan ${cost.name}`}
                        className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <input
                  type="text"
                  aria-label="Nama tagihan"
                  placeholder="Nama tagihan (misal: Kos, WiFi)"
                  value={newCostName}
                  onChange={(e) => setNewCostName(e.target.value)}
                  className="sm:col-span-3 px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500"
                />
                <div className="sm:col-span-2 relative flex items-center">
                  <span className="absolute left-3 text-[11px] font-mono text-slate-400 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="number"
                    aria-label="Nominal tagihan"
                    placeholder="Nominal/bln"
                    value={newCostAmount}
                    onChange={(e) => setNewCostAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 font-mono-num"
                  />
                </div>
                <input
                  type="number"
                  aria-label="Tanggal jatuh tempo"
                  min="1"
                  max="31"
                  placeholder="Tgl (1-28)"
                  value={newCostDueDay}
                  onChange={(e) => setNewCostDueDay(e.target.value)}
                  className="sm:col-span-1 px-2.5 py-2 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 font-mono-num"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Siklus:</span>
                  {[
                    { v: "1", l: "Bulanan" },
                    { v: "3", l: "Per 3 Bln" },
                    { v: "4", l: "Per 4 Bln" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setNewCostCycle(opt.v)}
                      className={`px-2.5 py-1 rounded-lg border transition ${
                        newCostCycle === opt.v
                          ? "bg-accent-500/20 text-accent-300 border-accent-500/40 font-semibold"
                          : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddFixedCost}
                  disabled={!newCostName.trim() || !newCostAmount}
                  className="min-h-[36px] px-4 py-1.5 bg-[var(--bg-inset)] hover:bg-[var(--hover-tint)] disabled:opacity-40 text-slate-100 border border-[var(--border-default)] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 pressable"
                >
                  <Plus className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
                  <span>Tambah Tagihan</span>
                </button>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] font-semibold text-xs btn-primary-diablo pressable"
            >
              {saving && <Spinner className="w-3.5 h-3.5" />}
              <span>{saving ? "Menyimpan..." : "Simpan Pengaturan"}</span>
            </button>
          </div>
        </form>

        {/* Akun & Koneksi Telegram */}
        <section className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent-300" aria-hidden="true" />
              <span>Akun &amp; Koneksi Telegram</span>
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>Aktif Terhubung</span>
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <DiabloAvatar className="w-11 h-11" />
              <div>
                <div className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                  <span>{displayName}</span>
                  {telegramHandle && (
                    <span className="text-xs text-slate-400 font-mono font-normal">
                      (@{telegramHandle})
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono-num mt-0.5 flex flex-wrap items-center gap-2">
                  <span>ID: {data?.userId || "-"}</span>
                  <span className="text-slate-600">·</span>
                  <span>Siklus: Tgl {paydayDate}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loggingOut}
              onClick={async () => {
                if (loggingOut) return;
                setLoggingOut(true);
                await logoutSession();
              }}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 pressable"
            >
              {loggingOut ? (
                <Spinner className="w-3.5 h-3.5" />
              ) : (
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{loggingOut ? "Keluar..." : "Keluar dari Web"}</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function AturPage() {
  return (
    <Suspense fallback={<DiabloScreenLoader subtitle="Memuat pengaturan..." />}>
      <AturContent />
    </Suspense>
  );
}
