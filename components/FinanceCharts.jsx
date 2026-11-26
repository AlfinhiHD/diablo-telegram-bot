"use client";

import { Wifi, Zap, Fuel, Shirt, Cigarette, Activity } from "lucide-react";

const TONE_STROKES = {
  safe: "var(--color-emerald-400)",
  amber: "var(--color-amber-400)",
  danger: "var(--color-rose-400)",
  accent: "var(--color-accent-300)",
};

/** Pure SVG radial gauge for daily spending pace or savings progress. */
export function PaceRing({
  percent = 0,
  tone = "safe",
  size = 96,
  strokeWidth = 8,
  centerValue,
  centerLabel,
}) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  const strokeColor = TONE_STROKES[tone] || TONE_STROKES.safe;
  const valueText = centerValue !== undefined ? centerValue : `${Math.round(clamped)}%`;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0 select-none"
      style={{ width: size, height: size }}
      aria-label={`${valueText}${centerLabel ? ` ${centerLabel}` : ""}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--track-bg)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 500ms var(--ease-out)",
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1">
        <span
          className={`font-heading font-bold leading-none text-slate-100 ${
            size >= 90 ? "text-base" : "text-xs"
          }`}
        >
          {valueText}
        </span>
        {centerLabel && (
          <span className="text-[11px] text-slate-400 leading-tight mt-0.5">{centerLabel}</span>
        )}
      </div>
    </div>
  );
}

/** Pure SVG multi-segment donut chart for NEED / WANT / GIFT / ASSET composition. */
export function IntentDonut({
  segments = [],
  size = 128,
  strokeWidth = 14,
  centerValue,
  centerLabel,
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const activeSegments = segments.filter((s) => (Number(s.percent) || 0) > 0);
  const totalPct = activeSegments.reduce((acc, s) => acc + (Number(s.percent) || 0), 0);
  const gap = activeSegments.length > 1 ? 3 : 0;

  let cumulativeLength = 0;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0 select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--track-bg)"
          strokeWidth={strokeWidth}
        />

        {totalPct > 0 &&
          activeSegments.map((seg) => {
            const share = (Number(seg.percent) || 0) / totalPct;
            const rawLen = share * circumference;
            const segLen = Math.max(0, rawLen - gap);
            const dashOffset = -cumulativeLength;
            cumulativeLength += rawLen;

            return (
              <circle
                key={seg.key || seg.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color || "var(--color-accent-500)"}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                strokeDasharray={`${segLen} ${circumference}`}
                strokeDashoffset={dashOffset}
                style={{
                  transition: "stroke-dasharray 450ms var(--ease-out)",
                }}
              />
            );
          })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        {centerValue !== undefined && (
          <span className="font-heading font-bold text-sm text-slate-100 leading-tight">
            {centerValue}
          </span>
        )}
        {centerLabel && (
          <span className="text-[11px] text-slate-400 leading-tight mt-0.5">{centerLabel}</span>
        )}
      </div>
    </div>
  );
}

/** Shared icon mapper for routine variable expense buckets (single source across Beranda & Laporan). */
export function RoutineIcon({ bucketKey, className = "w-4 h-4" }) {
  switch (bucketKey) {
    case "kuota":
      return <Wifi className={className} aria-hidden="true" />;
    case "listrik":
      return <Zap className={className} aria-hidden="true" />;
    case "bensin":
      return <Fuel className={className} aria-hidden="true" />;
    case "laundry":
      return <Shirt className={className} aria-hidden="true" />;
    case "rokok":
      return <Cigarette className={className} aria-hidden="true" />;
    default:
      return <Activity className={className} aria-hidden="true" />;
  }
}
