"use client";

import { useState } from "react";
import { X, Sparkles, Send, Wallet } from "lucide-react";
import { Spinner } from "./DiabloLoader";

export default function QuickLogModal({ isOpen, onClose, onSuccess, wallets = [] }) {
  const [text, setText] = useState("");
  const [walletId, setWalletId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const activeWallets = (wallets || []).filter((w) => !w.locked);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diablo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_expense",
          text: text.trim(),
          ...(walletId ? { walletId } : {}),
          source: "web-quick-modal",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gagal mencatat transaksi");
      }

      setText("");
      setWalletId("");
      if (onSuccess) onSuccess(data.items);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bento-card rounded-2xl p-6 border border-slate-800 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-500/15 border border-accent-500/35 flex items-center justify-center text-accent-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="font-heading font-semibold text-slate-100 text-sm">
              Catat Pengeluaran Cepat
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Ketik pengeluaran atau pemasukan seperti chat ke Diablo:
            </label>
            <textarea
              autoFocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Contoh keluar: kopi 15k & makan siang 20k\nContoh masuk: dapet duit 50k dari ngamen"}
              className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-accent-500 transition resize-none font-sans"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              AI Diablo otomatis bedakan pengeluaran vs pemasukan, kategori, dan intent.
            </p>
          </div>

          {activeWallets.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                <Wallet className="w-3.5 h-3.5 text-accent-300" />
                <span>Sumber / Tujuan Dana</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setWalletId("")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
                    walletId === ""
                      ? "bg-accent-500/20 text-accent-300 border-accent-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  Auto / Default
                </button>
                {activeWallets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWalletId(w.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
                      walletId === w.id
                        ? "bg-accent-500/20 text-accent-300 border-accent-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition shadow-lg shadow-accent-500/20"
            >
              {loading ? (
                <>
                  <Spinner className="w-3.5 h-3.5" />
                  <span>Mencatat...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Simpan Catatan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
