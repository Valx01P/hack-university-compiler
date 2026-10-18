"use client";

import { useEffect, useState } from "react";

/**
 * App theme store. The app ships Light + Dark plus four editor-matched
 * full-page themes (Dracula/Monokai/Nord/Solarized). The chosen id is written
 * to <html data-theme>; every dark-background theme ALSO gets <html data-dark>
 * so the `dark:` utilities and the hand-written dark CSS rules in globals.css
 * apply (see the `@custom-variant dark` definition). localStorage is canonical
 * and set pre-paint by the bootstrap in app/layout.tsx; a `hu:theme-changed`
 * event keeps every picker (header toggle + editor gear) in sync same-tab,
 * and `storage` syncs across tabs.
 */
export const APP_THEMES: { id: string; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "dracula", label: "Dracula" },
  { id: "monokai", label: "Monokai" },
  { id: "nord", label: "Nord" },
  { id: "solarized", label: "Solarized" },
];

export const THEME_KEY = "hu-theme";
export const THEME_EVENT = "hu:theme-changed";

/** Dark-background themes — they carry the `data-dark` flag. Keep in sync with
 *  the bootstrap script in app/layout.tsx (inlined, can't import this). */
const DARK_THEMES = new Set(["dark", "dracula", "monokai", "nord", "solarized"]);

/** Each page theme's matching editor (code) theme. Picking a page theme snaps
 *  the always-dark compiler editor to this — the user can still
 *  override it afterward via the editor gear (persists until the next theme
 *  switch). Light pairs with GitHub Light; the rest share their own name. */
const PREFERRED_CODE_THEME: Record<string, string> = {
  light: "github-light",
  dark: "midnight",
  dracula: "dracula",
  monokai: "monokai",
  nord: "nord",
  solarized: "solarized",
};
const CODE_THEME_KEY = "hu-code-theme";
const CODE_THEME_EVENT = "hu:code-theme-changed";

export function getTheme(): string {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(THEME_KEY) || "light";
  } catch {
    return "light";
  }
}

/** Apply a theme to <html> (data-theme + data-dark) and persist it. */
export function applyTheme(id: string) {
  const d = document.documentElement;
  d.setAttribute("data-theme", id);
  if (DARK_THEMES.has(id)) d.setAttribute("data-dark", "");
  else d.removeAttribute("data-dark");
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Apply + broadcast so other pickers re-render. Also snaps the editor code
 *  theme to this page theme's preferred one (overridable afterward via the
 *  editor gear). */
export function setTheme(id: string) {
  applyTheme(id);
  const code = PREFERRED_CODE_THEME[id] ?? "midnight";
  document.documentElement.setAttribute("data-code-theme", code);
  try {
    localStorage.setItem(CODE_THEME_KEY, code);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(THEME_EVENT));
    window.dispatchEvent(new Event(CODE_THEME_EVENT));
  } catch {
    /* ignore */
  }
}

/** Subscribe to the current theme id (re-renders on change, any tab). */
export function useTheme(): string {
  const [theme, set] = useState("light");
  useEffect(() => {
    set(getTheme());
    const refresh = () => set(getTheme());
    const onStorage = (e: StorageEvent) => {
      if (!e || e.key === THEME_KEY) refresh();
    };
    window.addEventListener(THEME_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return theme;
}

/**
 * High contrast is a modifier on top of whichever theme is active: every page
 * theme and editor theme has a deeper, higher-contrast variant in globals.css,
 * keyed off <html data-contrast="high">. Stored as "high" | "normal". Until
 * the user picks, the pre-paint bootstrap in app/layout.tsx follows the OS
 * "increase contrast" setting.
 */
export const CONTRAST_KEY = "hu-contrast";
export const CONTRAST_EVENT = "hu:contrast-changed";

function applyHighContrast(on: boolean) {
  const d = document.documentElement;
  if (on) d.setAttribute("data-contrast", "high");
  else d.removeAttribute("data-contrast");
}

/** Turn high contrast on or off, persist it, and broadcast to every toggle. */
export function setHighContrast(on: boolean) {
  applyHighContrast(on);
  try {
    localStorage.setItem(CONTRAST_KEY, on ? "high" : "normal");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(CONTRAST_EVENT));
  } catch {
    /* ignore */
  }
}

/** Subscribe to the high-contrast flag (re-renders on change, any tab). */
export function useHighContrast(): boolean {
  const [on, set] = useState(false);
  useEffect(() => {
    const refresh = () =>
      set(document.documentElement.getAttribute("data-contrast") === "high");
    refresh();
    // Another tab flipped it: mirror the stored choice onto this page too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CONTRAST_KEY) return;
      applyHighContrast(e.newValue === "high");
      refresh();
    };
    window.addEventListener(CONTRAST_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CONTRAST_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return on;
}
