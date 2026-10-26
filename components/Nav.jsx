"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DiabloAvatar from "./DiabloAvatar";
import {
  Home,
  PiggyBank,
  History,
  SlidersHorizontal,
  LogOut,
  Send,
} from "lucide-react";

export default function Nav({ userId, profile, onQuickLog }) {
  const pathname = usePathname();
  const displayName = profile?.ownerName || profile?.telegramName || (userId === "1128526190" ? "Alfin" : "Tuan");
  const handle = profile?.telegramUsername || (userId === "1128526190" ? "nocelestial14" : "");

  const links = [
    { href: "/", label: "Beranda", icon: Home },
    { href: "/tabungan", label: "Tabungan", icon: PiggyBank },
    { href: "/riwayat", label: "Riwayat", icon: History },
    { href: "/atur", label: "Atur", icon: SlidersHorizontal },
  ];

  return (
    <>
      {/* Top Navbar for Desktop & Tablet */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <DiabloAvatar className="w-9 h-9" showBadge={true} />
            <div>
              <div className="font-heading font-bold text-sm tracking-tight text-slate-100 flex items-center gap-2">
                <span>Diablo Finance</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono hidden xs:inline-block">
                  Butler
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <span className="font-semibold text-slate-200 truncate max-w-[120px] sm:max-w-[180px]">
                  {displayName}
                </span>
                {handle && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400 font-mono text-[10px] hidden sm:inline">
                      @{handle}
                    </span>
                  </>
                )}
                {userId && (
                  <>
                    <span className="text-slate-600 hidden md:inline">•</span>
                    <span className="text-slate-500 font-mono text-[9px] hidden md:inline">
                      ID: {userId}
                    </span>
                  </>
                )}
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Action: Quick Log & Logout */}
          <div className="flex items-center gap-2">
            {onQuickLog && (
              <button
                onClick={onQuickLog}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition"
              >
                <span>+ Catat</span>
              </button>
            )}

            <form action="/auth/logout" method="POST">
              <button
                type="submit"
                title="Keluar / Ganti Akun"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Mobile Floating Bottom Bar */}
      <nav className="sm:hidden fixed bottom-4 inset-x-4 z-40 bg-slate-900/90 border border-slate-800 backdrop-blur-lg rounded-2xl p-1.5 shadow-2xl flex items-center justify-around">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 px-2 rounded-xl text-[10px] font-medium transition ${
                active
                  ? "bg-emerald-500/15 text-emerald-400 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{label}</span>
            </Link>
          );
        })}

        {onQuickLog && (
          <button
            onClick={onQuickLog}
            className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl bg-emerald-500 text-slate-950 font-bold text-[10px] shrink-0"
          >
            <span>+ Catat</span>
          </button>
        )}
      </nav>
    </>
  );
}
