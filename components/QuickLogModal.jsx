"use client";

import { useState } from "react";
import { Send, Wallet } from "lucide-react";
import Modal from "./Modal";
import { Spinner } from "./DiabloLoader";

export default function QuickLogModal({
  isOpen,
  onClose,
  onSuccess,
  wallets = [],
  agentName = "Diablo",
}) {
  const [text, setText] = useState("");
  const [walletId, setWalletId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeWallets = (wallets || []).filter((w) => !w.locked);

  async function submitEntry() {
    if (!text.trim() || loading) return;

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

  function handleSubmit(e) {
    e.preventDefault();
    submitEntry();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Catat Pengeluaran Cepat"
      subtitle={`Tulis bebas seperti chat ke ${agentName}. AI membedakan masuk, keluar, dan kategori.`}
    >
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="quick-log-input" className="block text-xs text-slate-400 mb-1.5">
            Nominal dan keterangan
          </label>
          <textarea
            id="quick-log-input"
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submitEntry();
              }
            }}
            placeholder={
              "Contoh keluar: kopi 15k & makan siang 20k\nContoh masuk: dapet duit 50k dari freelance"
            }
            className="w-full px-3.5 py-2.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-accent-500 transition resize-none font-sans"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            Tekan Ctrl+Enter untuk simpan cepat.
          </p>
        </div>

        {activeWallets.length > 0 && (
          <div>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <Wallet className="w-3.5 h-3.5 text-accent-300" aria-hidden="true" />
              <span>Sumber / Tujuan Dana</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setWalletId("")}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition border pressable ${
                  walletId === ""
                    ? "bg-accent-500/20 text-accent-300 border-accent-500/45"
                    : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
                }`}
              >
                Auto / Default
              </button>
              {activeWallets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWalletId(w.id)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition border pressable ${
                    walletId === w.id
                      ? "bg-accent-500/20 text-accent-300 border-accent-500/45"
                      : "bg-[var(--bg-inset)] text-slate-400 border-[var(--border-subtle)] hover:text-slate-200"
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
            className="min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[var(--hover-tint)] pressable"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="min-h-[38px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-[var(--cta-ink)] text-xs font-semibold btn-primary-diablo pressable"
          >
            {loading ? (
              <>
                <Spinner className="w-3.5 h-3.5" />
                <span>Mencatat...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Simpan Catatan</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
