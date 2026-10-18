"use client";

import { useEffect, useState } from "react";

/** Editor color themes — applied app-wide to every .code-dark surface. */
export const CODE_THEMES: { id: string; label: string }[] = [
  { id: "midnight", label: "Midnight" },
  { id: "dracula", label: "Dracula" },
  { id: "monokai", label: "Monokai" },
  { id: "nord", label: "Nord" },
  { id: "solarized", label: "Solarized" },
  { id: "github-light", label: "GitHub Light" },
];

export function getCodeTheme(): string {
  try {
    return localStorage.getItem("hu-code-theme") || "midnight";
  } catch {
    return "midnight";
  }
}

export function applyCodeTheme(next: string) {
  try {
    localStorage.setItem("hu-code-theme", next);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute("data-code-theme", next);
}

export function CodeThemePicker({ className }: { className?: string }) {
  const [theme, setTheme] = useState("midnight");

  useEffect(() => {
    const saved = getCodeTheme();
    setTheme(saved);
    // Re-apply to <html> so every .code-dark surface reflects the saved theme
    // even if the pre-paint bootstrap and this picker ever drift out of sync.
    document.documentElement.setAttribute("data-code-theme", saved);
    // Re-sync when a page-theme switch snaps the editor theme (or another tab).
    const refresh = () => setTheme(getCodeTheme());
    const onStorage = (e: StorageEvent) => {
      if (!e || e.key === "hu-code-theme") refresh();
    };
    window.addEventListener("hu:code-theme-changed", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("hu:code-theme-changed", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function change(next: string) {
    setTheme(next);
    applyCodeTheme(next);
  }

  return (
    <select
      value={theme}
      onChange={(e) => change(e.target.value)}
      aria-label="Code editor theme"
      title="Editor theme"
      className={
        className ??
        "field rounded-btn px-2 py-1.5 text-xs font-medium text-ink"
      }
    >
      {CODE_THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
