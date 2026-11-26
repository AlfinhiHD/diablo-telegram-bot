"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import DiabloAvatar from "@/components/DiabloAvatar";
import ThemeToggle from "@/components/ThemeToggle";
import { DiabloScreenLoader, Spinner } from "@/components/DiabloLoader";
import { CheckCircle2, AlertTriangle } from "lucide-react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const loggedOut = searchParams.get("logged_out") === "1";
  const [tokenInput, setTokenInput] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const errorMessage =
    error === "expired"
      ? "Link login sudah kedaluwarsa atau sudah digunakan. Silakan minta link baru via Telegram."
      : error === "missing_token"
      ? "Token login tidak ditemukan. Silakan klik link dari bot Telegram Anda."
      : error
      ? "Gagal masuk. Silakan kirim perintah /login di bot Telegram Anda."
      : null;

  return (
    <div className="min-h-screen bg-fintech-canvas flex items-center justify-center p-4 relative">
      <div className="fixed top-4 right-4 z-30">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <DiabloAvatar className="w-16 h-16" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-heading">
            Diablo Finance
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Asisten Keuangan Pribadi via Telegram &amp; Web
          </p>
        </div>

        {/* Logout Success Alert */}
        {!errorMessage && loggedOut && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" aria-hidden="true" />
            <span>
              Anda berhasil keluar dari Web Dashboard. Kirim{" "}
              <code className="px-1.5 py-0.5 rounded bg-[var(--bg-inset)] font-mono text-emerald-300">
                /dashboard
              </code>{" "}
              di Telegram kapan saja untuk masuk kembali.
            </span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Card */}
        <div
          data-tone="accent"
          className="hero-vault rounded-2xl p-6 sm:p-8 space-y-6"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-100 font-heading">
              Masuk Tanpa Password
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Autentikasi terhubung langsung ke Telegram. Aman, cepat, tanpa kata sandi.
            </p>
          </div>

          {/* Airy 3-step vertical guide */}
          <ol className="relative space-y-4 pl-8 before:content-[''] before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-[var(--border-subtle)]">
            <li className="relative text-xs text-slate-300 leading-relaxed">
              <span className="absolute -left-8 top-0 w-6 h-6 rounded-full bg-[var(--bg-inset)] border border-accent-500/40 text-accent-300 text-[11px] font-bold flex items-center justify-center font-mono-num">
                1
              </span>
              <span>
                Buka bot Telegram{" "}
                <strong className="font-semibold text-accent-300">@diablo_finance_bot</strong>.
              </span>
            </li>

            <li className="relative text-xs text-slate-300 leading-relaxed">
              <span className="absolute -left-8 top-0 w-6 h-6 rounded-full bg-[var(--bg-inset)] border border-accent-500/40 text-accent-300 text-[11px] font-bold flex items-center justify-center font-mono-num">
                2
              </span>
              <span>
                Kirim perintah{" "}
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-slate-100 font-mono">
                  /login
                </code>
                .
              </span>
            </li>

            <li className="relative text-xs text-slate-300 leading-relaxed">
              <span className="absolute -left-8 top-0 w-6 h-6 rounded-full bg-[var(--bg-inset)] border border-accent-500/40 text-accent-300 text-[11px] font-bold flex items-center justify-center font-mono-num">
                3
              </span>
              <span>
                Klik tautan yang dikirim Diablo untuk langsung masuk ke dashboard.
              </span>
            </li>
          </ol>

          <a
            href="https://t.me/diablo_finance_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[44px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] font-semibold text-sm btn-primary-diablo pressable"
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
            <span>Buka @diablo_finance_bot di Telegram</span>
          </a>

          <div className="pt-3 border-t border-[var(--border-subtle)] text-center">
            <button
              type="button"
              onClick={() => setShowManual(!showManual)}
              className="text-xs text-slate-400 hover:text-slate-200 transition"
            >
              {showManual ? "Sembunyikan input manual" : "Punya token login manual?"}
            </button>

            {showManual && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tokenInput.trim() && !verifying) {
                    setVerifying(true);
                    window.location.href = `/auth/verify?token=${encodeURIComponent(
                      tokenInput.trim()
                    )}`;
                  }
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  aria-label="Token login manual"
                  placeholder="Paste token di sini..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={verifying}
                  className="flex-1 px-3 py-2 text-xs bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 font-mono disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={verifying || !tokenInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-tint)] border border-[var(--border-default)] disabled:opacity-50 text-xs font-semibold text-slate-100 rounded-lg pressable"
                >
                  {verifying && <Spinner className="w-3.5 h-3.5" />}
                  <span>{verifying ? "Memverifikasi..." : "Verifikasi"}</span>
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500">
          Diablo Assistant · Disiplin Finansial Tanpa Ribet
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<DiabloScreenLoader subtitle="Memuat halaman masuk..." />}>
      <LoginContent />
    </Suspense>
  );
}
