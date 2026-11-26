"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

/** Light/Dark theme switcher with localStorage persistence and cross-component sync. */
export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    function sync() {
      const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      setTheme(cur);
    }
    sync();
    window.addEventListener("diablo-theme-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("diablo-theme-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("diablo_theme", next);
    } catch {}
    setTheme(next);
    window.dispatchEvent(new Event("diablo-theme-change"));
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Aktifkan mode gelap" : "Aktifkan mode terang"}
      title={isLight ? "Ganti ke Mode Gelap" : "Ganti ke Mode Terang"}
      className={`w-8 h-8 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-tint)] border border-[var(--border-subtle)] text-slate-300 hover:text-slate-100 flex items-center justify-center shrink-0 pressable ${className}`}
    >
      {isLight ? (
        <Moon className="w-4 h-4 text-accent-300" aria-hidden="true" />
      ) : (
        <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
      )}
    </button>
  );
}
