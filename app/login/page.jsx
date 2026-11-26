"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import DiabloAvatar from "@/components/DiabloAvatar";
import { DiabloScreenLoader, Spinner } from "@/components/DiabloLoader";

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
    <div className="min-h-screen bg-fintech-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <DiabloAvatar className="w-16 h-16" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-heading">
            Diablo Finance
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Asisten Keuangan Pribadi via Telegram & Web
          </p>
        </div>

        {/* Logout Success Alert */}
        {!errorMessage && loggedOut && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-3">
            <svg
              className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Anda berhasil keluar dari Web Dashboard. Kirim <code className="px-1 py-0.5 rounded bg-emerald-950/60 font-mono text-xs">/dashboard</code> di Telegram kapan saja untuk masuk kembali.</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
            <svg
              className="w-5 h-5 shrink-0 mt-0.5 text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Card */}
        <div className="bento-card rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">
              Masuk Tanpa Password
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Autentikasi terhubung langsung dengan akun Telegram Anda. Aman, cepat,
              dan tidak perlu menghafal kata sandi.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-500/20 text-accent-300 text-xs font-bold shrink-0">
                1
              </span>
              <div className="text-xs text-slate-300">
                Buka bot Telegram{" "}
                <span className="font-semibold text-accent-300">@diablo_finance_bot</span>.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-500/20 text-accent-300 text-xs font-bold shrink-0">
                2
              </span>
              <div className="text-xs text-slate-300">
                Kirim perintah <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-100 font-mono">/login</code>.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-500/20 text-accent-300 text-xs font-bold shrink-0">
                3
              </span>
              <div className="text-xs text-slate-300">
                Klik tombol atau link yang dikirim Diablo. Anda langsung otomatis masuk.
              </div>
            </div>
          </div>

          {/* Action Button */}
          <a
            href="https://t.me/diablo_finance_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-accent-500 hover:bg-accent-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-accent-500/20"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
            Buka @diablo_finance_bot di Telegram
          </a>

          {/* Collapsible Manual Token Input for dev/testing */}
          <div className="pt-2 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={() => setShowManual(!showManual)}
              className="text-xs text-slate-500 hover:text-slate-400 transition"
            >
              {showManual ? "Sembunyikan input manual" : "Punya token login manual?"}
            </button>

            {showManual && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tokenInput.trim() && !verifying) {
                    setVerifying(true);
                    window.location.href = `/auth/verify?token=${encodeURIComponent(tokenInput.trim())}`;
                  }
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Paste token di sini..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={verifying}
                  className="flex-1 px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500 font-mono disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={verifying || !tokenInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 rounded-lg transition"
                >
                  {verifying && <Spinner className="w-3.5 h-3.5" />}
                  <span>{verifying ? "Memverifikasi..." : "Verifikasi"}</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Diablo Assistant • Disiplin Finansial Tanpa Ribet
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
