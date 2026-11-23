"use client";

export default function DiabloAvatar({ className = "w-9 h-9", showBadge = false }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      {/* Outer Glow Halo */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-500/30 via-accent-300/20 to-slate-900/60 blur-[3px]" />
      
      {/* Container Shield */}
      <div className="relative w-full h-full rounded-2xl bg-slate-950 border border-accent-500/35 overflow-hidden flex items-center justify-center shadow-lg group-hover:border-accent-300/60 transition">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full p-1"
        >
          {/* Subtle Ambient Background */}
          <circle cx="32" cy="32" r="28" fill="url(#diabloGrad)" opacity="0.15" />

          {/* Diablo's Sleek Butler Silhouette & Collar */}
          <path
            d="M16 52C16 43 23 37 32 37C41 37 48 43 48 52V54H16V52Z"
            fill="#243343"
            stroke="#5C98CD"
            strokeWidth="1.5"
          />
          {/* Butler Crimson Tie & Cravat */}
          <path
            d="M32 38L35 45L32 52L29 45L32 38Z"
            fill="#F92672"
          />
          <path
            d="M30 40H34L32 44L30 40Z"
            fill="#FF6541"
          />

          {/* Mask / Horn Silhouette (Tensura Demon Butler Motif) */}
          <path
            d="M20 22C20 22 23 15 28 17C29 17.5 30 20 30 20C30 20 31 17.5 32 17C33 16.5 34 20 34 20C34 20 35 17.5 36 17C41 15 44 22 44 22C44 22 42 27 38 29C34 31 32 32 32 32C32 32 30 31 26 29C22 27 20 22 20 22Z"
            fill="#19242F"
            stroke="#66D9EF"
            strokeWidth="1.2"
          />

          {/* Glowing Eyes */}
          <circle cx="28" cy="24" r="1.5" fill="#FF6541" />
          <circle cx="36" cy="24" r="1.5" fill="#FF6541" />
          <circle cx="28" cy="24" r="0.6" fill="#F8F8F2" />
          <circle cx="36" cy="24" r="0.6" fill="#F8F8F2" />

          {/* Gold Pin Accents */}
          <circle cx="32" cy="39" r="1" fill="#FFAB28" />

          <defs>
            <radialGradient id="diabloGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 32) rotate(90) scale(28)">
              <stop stopColor="#5C98CD" />
              <stop offset="1" stopColor="#19242F" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      {showBadge && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
      )}
    </div>
  );
}
