"use client";

export default function DiabloAvatar({ className = "w-9 h-9", showBadge = false }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div className="relative w-full h-full rounded-xl bg-slate-950 border border-accent-500/35 overflow-hidden flex items-center justify-center shadow-md group-hover:border-accent-300/60 transition">
        <img
          src="/diablo-mark.png"
          alt="Diablo Finance"
          className="w-full h-full object-cover select-none"
          draggable={false}
        />
      </div>

      {showBadge && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
      )}
    </div>
  );
}
