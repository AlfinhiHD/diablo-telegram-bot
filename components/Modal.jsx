"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Shared accessible dialog wrapper with Escape handling, backdrop close, and body scroll lock. */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-md",
  children,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e) {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-[var(--bg-backdrop)] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-modal)] border border-[var(--border-default)] shadow-2xl p-5 sm:p-6 space-y-4`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading font-semibold text-slate-100 text-sm sm:text-base">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[var(--hover-tint)] flex items-center justify-center shrink-0 pressable"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
