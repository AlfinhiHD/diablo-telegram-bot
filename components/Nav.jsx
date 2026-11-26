"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DiabloAvatar from "./DiabloAvatar";
import ThemeToggle from "./ThemeToggle";
import { Spinner } from "./DiabloLoader";
import { logoutSession, useDiabloRefreshing } from "@/lib/diablo-client";
import { normalizeAgent } from "@/lib/agent-persona";
import {
  Home,
  PiggyBank,
  History,
  BarChart3,
  SlidersHorizontal,
  LogOut,
} from "lucide-react";

export default function Nav({ userId, profile, onQuickLog }) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const refreshing = useDiabloRefreshing();

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logoutSession();
  }

  const agent = normalizeAgent(profile?.agent);
  const displayName =
    profile?.ownerName ||
    profile?.telegramName ||
    (userId === "1128526190" ? "Alfin" : "Tuan");
  const handle =
    profile?.telegramUsername ||
    (userId === "1128526190" ? "nocelestial14" : "");

  const links = [
    { href: "/", label: "Beranda", icon: Home },
    { href: "/tabungan", label: "Tabungan", icon: PiggyBank },
    { href: "/riwayat", label: "Riwayat", icon: History },
    { href: "/laporan", label: "Laporan", icon: BarChart3 },
    { href: "/atur", label: "Atur", icon: SlidersHorizontal },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-nav)] backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 min-w-0">
            <DiabloAvatar className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <div className="font-heading font-bold text-sm tracking-tight text-slate-100 whitespace-nowrap">
                {agent.name} Finance
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-medium text-slate-300 truncate max-w-[110px]">
                  {displayName}
                </span>
                {handle && (
                  <>
                    <span className="text-slate-600 hidden lg:inline">·</span>
                    <span className="text-slate-500 font-mono text-[11px] hidden lg:inline">
                      @{handle}
                    </span>
                  </>
                )}
              </div>
            </div>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className="hidden sm:flex items-center gap-0.5 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-subtle)] shrink-0"
          >
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    active
                      ? "bg-[var(--bg-active)] text-slate-100 shadow-xs after:content-[''] after:absolute after:bottom-0 after:inset-x-2.5 after:h-[2px] after:rounded-full after:bg-accent-300"
                      : "text-slate-400 hover:text-slate-100 hover:bg-[var(--hover-tint)]"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? "text-accent-300" : "text-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            {onQuickLog && (
              <button
                type="button"
                onClick={onQuickLog}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] text-xs font-semibold whitespace-nowrap shrink-0 btn-primary-diablo pressable"
              >
                <span>+ Catat</span>
              </button>
            )}

            <ThemeToggle />

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              title="Keluar / Ganti Akun"
              aria-label="Keluar"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 disabled:opacity-50 whitespace-nowrap shrink-0 pressable"
            >
              {loggingOut ? (
                <Spinner className="w-3.5 h-3.5" />
              ) : (
                <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{loggingOut ? "Keluar..." : "Keluar"}</span>
            </button>
          </div>
        </div>
        {refreshing && (
          <div
            aria-hidden="true"
            className="absolute bottom-0 inset-x-0 h-[2px] overflow-hidden pointer-events-none"
          >
            <div className="h-full top-loading-bar rounded-full" />
          </div>
        )}
      </header>

      <nav
        aria-label="Navigasi seluler"
        className="sm:hidden fixed bottom-3 inset-x-3 z-40 bg-[var(--bg-dock)] border border-[var(--border-default)] backdrop-blur-md rounded-2xl p-1.5 shadow-2xl flex items-center justify-between gap-1"
      >
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 min-h-[44px] py-1 px-1 rounded-xl text-[10px] font-medium transition ${
                active
                  ? "bg-[var(--bg-active)] text-slate-100 font-semibold"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              <Icon
                className={`w-4 h-4 mb-0.5 shrink-0 ${active ? "text-accent-300" : ""}`}
                aria-hidden="true"
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}

        {onQuickLog && (
          <button
            type="button"
            onClick={onQuickLog}
            className="flex flex-col items-center justify-center min-h-[44px] py-1 px-3 rounded-xl bg-accent-500 hover:bg-accent-400 text-[var(--cta-ink)] font-bold text-[11px] shrink-0 btn-primary-diablo pressable"
          >
            <span>+ Catat</span>
          </button>
        )}
      </nav>
    </>
  );
}
