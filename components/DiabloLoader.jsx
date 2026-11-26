"use client";

import { Loader2 } from "lucide-react";
import DiabloAvatar from "./DiabloAvatar";

/** Inline spinner for buttons and compact async states. */
export function Spinner({ className = "w-4 h-4" }) {
  return <Loader2 className={`${className} animate-spin shrink-0`} aria-hidden="true" />;
}

/** Branded full-screen fallback loader with rotating ring and calm text. */
export function DiabloScreenLoader({
  title = "Diablo Finance",
  subtitle = "Menyiapkan pundi-pundi Tuan...",
}) {
  return (
    <div className="min-h-screen bg-fintech-canvas flex flex-col items-center justify-center px-6 text-center">
      <div className="relative flex items-center justify-center mb-4">
        <span
          className="absolute -inset-2 rounded-2xl border-2 border-accent-500/20 border-t-accent-300 animate-spin"
          aria-hidden="true"
        />
        <DiabloAvatar className="w-12 h-12" />
      </div>
      <p className="text-sm font-semibold text-slate-100 tracking-tight">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

function ShimmerBar({ className = "h-4 w-32" }) {
  return <div className={`skeleton-shimmer rounded-lg ${className}`} aria-hidden="true" />;
}

/** Shimmer skeleton layout matching each main route's matte surface structure. */
export function PageSkeleton({ variant = "dashboard" }) {
  if (variant === "tabungan") {
    return (
      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5" aria-busy="true">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <ShimmerBar className="h-7 w-52" />
            <ShimmerBar className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="flex gap-2">
            <ShimmerBar className="h-9 w-24 rounded-xl" />
            <ShimmerBar className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        <div className="surface-card rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ShimmerBar className="h-14 w-full rounded-xl" />
          <ShimmerBar className="h-14 w-full rounded-xl" />
          <ShimmerBar className="h-14 w-full rounded-xl" />
        </div>
        <ShimmerBar className="h-11 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <ShimmerBar className="h-4 w-36" />
                <ShimmerBar className="h-5 w-24" />
              </div>
              <ShimmerBar className="h-2 w-full rounded-full" />
              <ShimmerBar className="h-8 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (variant === "riwayat") {
    return (
      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5" aria-busy="true">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <ShimmerBar className="h-7 w-44" />
            <ShimmerBar className="h-3.5 w-64 max-w-full" />
          </div>
          <ShimmerBar className="h-10 w-36 rounded-xl" />
        </div>
        <div className="surface-card rounded-2xl p-4 space-y-3">
          <ShimmerBar className="h-10 w-full rounded-xl" />
          <div className="flex gap-2">
            <ShimmerBar className="h-8 w-24 rounded-lg" />
            <ShimmerBar className="h-8 w-20 rounded-lg" />
            <ShimmerBar className="h-8 w-20 rounded-lg" />
          </div>
        </div>
        <div className="surface-card rounded-2xl p-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border-subtle)] last:border-b-0"
            >
              <div className="space-y-2 flex-1">
                <ShimmerBar className="h-4 w-48 max-w-[70%]" />
                <ShimmerBar className="h-3 w-32" />
              </div>
              <ShimmerBar className="h-5 w-24" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (variant === "laporan") {
    return (
      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5" aria-busy="true">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <ShimmerBar className="h-7 w-48" />
            <ShimmerBar className="h-3.5 w-60 max-w-full" />
          </div>
          <div className="flex gap-2">
            <ShimmerBar className="h-9 w-36 rounded-xl" />
            <ShimmerBar className="h-9 w-36 rounded-xl" />
          </div>
        </div>
        <div className="surface-card rounded-2xl p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <ShimmerBar className="h-3.5 w-24" />
              <ShimmerBar className="h-6 w-32" />
              <ShimmerBar className="h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="surface-card rounded-2xl p-5 space-y-3">
          <ShimmerBar className="h-4 w-40" />
          <ShimmerBar className="h-44 w-full rounded-xl" />
        </div>
      </main>
    );
  }

  if (variant === "atur") {
    return (
      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5" aria-busy="true">
        <div className="space-y-2">
          <ShimmerBar className="h-7 w-56" />
          <ShimmerBar className="h-3.5 w-72 max-w-full" />
        </div>
        <div className="surface-card rounded-2xl p-5 space-y-3">
          <ShimmerBar className="h-3.5 w-44" />
          <ShimmerBar className="h-3 w-full rounded-full" />
          <ShimmerBar className="h-4 w-64" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="surface-card rounded-2xl p-5 space-y-4">
            <ShimmerBar className="h-4 w-40" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ShimmerBar className="h-10 w-full rounded-xl" />
              <ShimmerBar className="h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 pt-6 space-y-5" aria-busy="true">
      <div className="surface-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <ShimmerBar className="h-4 w-44" />
          <ShimmerBar className="h-5 w-36 rounded-full" />
        </div>
        <ShimmerBar className="h-11 w-64 max-w-full" />
        <ShimmerBar className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-3 pt-2">
          <ShimmerBar className="h-12 w-full rounded-xl" />
          <ShimmerBar className="h-12 w-full rounded-xl" />
          <ShimmerBar className="h-12 w-full rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <ShimmerBar key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShimmerBar className="h-40 w-full rounded-2xl" />
        <ShimmerBar className="h-40 w-full rounded-2xl" />
      </div>
    </main>
  );
}
