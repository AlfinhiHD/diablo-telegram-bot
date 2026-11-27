"use client";

import { Search, X } from "lucide-react";

/** Reusable compact search input with Escape-to-clear and clear button. */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Cari...",
  ariaLabel = "Cari",
  className = "",
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        className="w-full min-h-[36px] pl-9 pr-8 py-1.5 bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 transition"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Hapus pencarian"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-100 transition"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
