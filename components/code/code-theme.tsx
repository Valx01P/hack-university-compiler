"use client";

import { useSyncExternalStore } from "react";

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

// The bootstrap applies the saved editor theme to <html> before first paint,
// so the picker reads it from there and opens on your choice, not "midnight"
// for a frame. Page-theme switches (which snap the editor theme) and other
// tabs re-render it through the change event and storage.
const subscribeCodeTheme = (notify: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== "hu-code-theme") return;
    document.documentElement.setAttribute("data-code-theme", getCodeTheme());
    notify();
  };
  window.addEventListener("hu:code-theme-changed", notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("hu:code-theme-changed", notify);
    window.removeEventListener("storage", onStorage);
  };
};
const currentCodeTheme = () => document.documentElement.getAttribute("data-code-theme") || getCodeTheme();

export function CodeThemePicker({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeCodeTheme, currentCodeTheme, () => "midnight");

  function change(next: string) {
    applyCodeTheme(next);
    window.dispatchEvent(new Event("hu:code-theme-changed"));
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
