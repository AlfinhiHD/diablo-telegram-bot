"use client";

export default function DiabloAvatar({ className = "w-9 h-9" }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div className="relative w-full h-full rounded-xl bg-[var(--bg-inset)] border border-[var(--border-default)] overflow-hidden flex items-center justify-center shadow-sm">
        <img
          src="/diablo-mark.png"
          alt="Diablo Finance"
          className="w-full h-full object-cover select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
