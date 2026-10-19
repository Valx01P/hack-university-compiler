"use client";

import { useSyncExternalStore } from "react";

/**
 * Every setting here is applied to <html> before first paint (the bootstrap
 * in app/layout.tsx), so the hooks read it from there synchronously: a menu
 * that opens after load shows your saved choice in its very first frame, never
 * the default for a moment. Server markup, and hydration, use the default.
 * `subscribeTo` re-renders on this tab's change event, and on another tab's
 * change (mirrored onto this page first, when `mirror` is given).
 */
function subscribeTo(event: string, storageKey: string, mirror?: (stored: string | null) => void) {
  return (notify: () => void) => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      mirror?.(e.newValue);
      notify();
    };
    window.addEventListener(event, notify);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(event, notify);
      window.removeEventListener("storage", onStorage);
    };
  };
}

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
const subscribeTheme = subscribeTo(THEME_EVENT, THEME_KEY);
const currentTheme = () => document.documentElement.getAttribute("data-theme") || getTheme();
export function useTheme(): string {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => "light");
}

/**
 * Contrast is a modifier on top of whichever theme is active: every page theme
 * and editor theme has a deeper High variant and an even stronger Super
 * variant in globals.css, keyed off <html data-contrast="high" | "super">
 * (no attribute = Normal). Until the user picks, the pre-paint bootstrap in
 * app/layout.tsx follows the OS "increase contrast" setting (High).
 */
export type ContrastLevel = "normal" | "high" | "super";

export const CONTRAST_LEVELS: { id: ContrastLevel; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "super", label: "Super" },
];

export const CONTRAST_KEY = "hu-contrast";
export const CONTRAST_EVENT = "hu:contrast-changed";

function toLevel(value: string | null): ContrastLevel {
  return value === "high" || value === "super" ? value : "normal";
}

function applyContrast(level: ContrastLevel) {
  const d = document.documentElement;
  if (level === "normal") d.removeAttribute("data-contrast");
  else d.setAttribute("data-contrast", level);
}

/** Set the contrast level, persist it, and broadcast to every picker. */
export function setContrast(level: ContrastLevel) {
  applyContrast(level);
  try {
    localStorage.setItem(CONTRAST_KEY, level);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(CONTRAST_EVENT));
  } catch {
    /* ignore */
  }
}

/** Subscribe to the contrast level (re-renders on change, any tab). */
const subscribeContrast = subscribeTo(CONTRAST_EVENT, CONTRAST_KEY, (stored) => applyContrast(toLevel(stored)));
const currentContrast = () => toLevel(document.documentElement.getAttribute("data-contrast"));
export function useContrast(): ContrastLevel {
  return useSyncExternalStore(subscribeContrast, currentContrast, () => "normal");
}

/**
 * Code background: one background for every code surface (the editor, code
 * blocks, and the output terminal) on top of whichever editor theme and
 * contrast level is active. Their text and syntax colors stay the editor
 * theme's. Stored as a #rrggbb color (no key = the theme's own background)
 * and applied before first paint by the bootstrap in app/layout.tsx, as
 * <html data-code-bg> plus the --code-bg-override variable.
 */
export const CODE_BG_PRESETS: { value: string; label: string }[] = [
  { value: "#2e2f34", label: "Graphite" },
  { value: "#1c2030", label: "Navy" },
  { value: "#0d1117", label: "Ink" },
  { value: "#1e1e1e", label: "Charcoal" },
  { value: "#282c34", label: "Slate" },
  { value: "#000000", label: "Black" },
];

export const CODE_BG_KEY = "hu-code-bg";
export const CODE_BG_EVENT = "hu:code-bg-changed";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A valid #rrggbb color, lowercased, or null. */
export function toCodeBg(value: string | null | undefined): string | null {
  return value && HEX_COLOR.test(value) ? value.toLowerCase() : null;
}

function applyCodeBg(value: string | null) {
  const d = document.documentElement;
  if (value) {
    d.setAttribute("data-code-bg", "");
    d.style.setProperty("--code-bg-override", value);
  } else {
    d.removeAttribute("data-code-bg");
    d.style.removeProperty("--code-bg-override");
  }
}

/** Set the code background (null = the theme's own), persist it, and
    broadcast to every picker. */
export function setCodeBackground(value: string | null) {
  const color = toCodeBg(value);
  applyCodeBg(color);
  try {
    if (color) localStorage.setItem(CODE_BG_KEY, color);
    else localStorage.removeItem(CODE_BG_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(CODE_BG_EVENT));
  } catch {
    /* ignore */
  }
}

function currentCodeBg(): string | null {
  const d = document.documentElement;
  return d.hasAttribute("data-code-bg") ? toCodeBg(d.style.getPropertyValue("--code-bg-override").trim()) : null;
}

/** Subscribe to the code background (null = the theme's own), any tab. */
const subscribeCodeBg = subscribeTo(CODE_BG_EVENT, CODE_BG_KEY, (stored) => applyCodeBg(toCodeBg(stored)));
export function useCodeBackground(): string | null {
  return useSyncExternalStore(subscribeCodeBg, currentCodeBg, () => null);
}

/**
 * Line visibility settings, from 0 (hidden) to 100 (the theme's own), each
 * stored as a number and applied before first paint by the bootstrap in
 * app/layout.tsx as a percentage variable on <html>:
 *
 * - Layout lines (--layout-lines): the big structural lines, like the
 *   panel's outline and bars, the language rail, sidebars and dividers, the
 *   editor, output, and cheatsheet and challenges boxes, and the outlined
 *   bar buttons.
 * - Content lines (--content-lines): the lines inside the content: tables,
 *   code blocks and inline code, search boxes and dropdowns, and the
 *   dividers in lessons, cheatsheets, challenges, and results.
 */
export const LAYOUT_LINES_KEY = "hu-layout-lines";
export const CONTENT_LINES_KEY = "hu-content-lines";

const toLines = (value: unknown): number => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100;
};

function lineSetting(key: string, cssVar: string) {
  const event = `hu:${key}-changed`;
  const current = () => {
    const v = document.documentElement.style.getPropertyValue(cssVar).trim();
    return v ? toLines(v.replace("%", "")) : 100;
  };

  /** Set the visibility (0 to 100), persist it, and broadcast. */
  function set(value: number) {
    const pct = toLines(value);
    document.documentElement.style.setProperty(cssVar, `${pct}%`);
    try {
      if (pct === 100) localStorage.removeItem(key);
      else localStorage.setItem(key, String(pct));
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new Event(event));
    } catch {
      /* ignore */
    }
  }

  /** Subscribe to the visibility (0 to 100), any tab. */
  const subscribe = subscribeTo(event, key, (stored) =>
    document.documentElement.style.setProperty(cssVar, `${toLines(stored ?? 100)}%`)
  );
  function use(): number {
    return useSyncExternalStore(subscribe, current, () => 100);
  }

  return { set, use };
}

const layoutLines = lineSetting(LAYOUT_LINES_KEY, "--layout-lines");
export const setLayoutLines = layoutLines.set;
export const useLayoutLines = layoutLines.use;

const contentLines = lineSetting(CONTENT_LINES_KEY, "--content-lines");
export const setContentLines = contentLines.set;
export const useContentLines = contentLines.use;

/**
 * Comments in the code examples of lessons and cheatsheets: shown (the
 * default) or hidden. Hidden is <html data-code-comments="hidden">, applied
 * before first paint by the bootstrap in app/layout.tsx, and CSS hides each
 * comment there (the `.code-cmt` spans from lib/highlight.tsx). Code you've
 * edited yourself always shows as you wrote it.
 */
export const CODE_COMMENTS_KEY = "hu-code-comments";
const CODE_COMMENTS_EVENT = "hu:code-comments-changed";

const commentsHidden = () => document.documentElement.getAttribute("data-code-comments") === "hidden";

function applyCodeComments(hidden: boolean) {
  if (hidden) document.documentElement.setAttribute("data-code-comments", "hidden");
  else document.documentElement.removeAttribute("data-code-comments");
}

/** Hide or show comments in the examples, persist it, and broadcast. */
export function setCodeCommentsHidden(hidden: boolean) {
  applyCodeComments(hidden);
  try {
    if (hidden) localStorage.setItem(CODE_COMMENTS_KEY, "hidden");
    else localStorage.removeItem(CODE_COMMENTS_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(CODE_COMMENTS_EVENT));
  } catch {
    /* ignore */
  }
}

const subscribeCodeComments = subscribeTo(CODE_COMMENTS_EVENT, CODE_COMMENTS_KEY, (stored) =>
  applyCodeComments(stored === "hidden")
);

/** Whether comments in the examples are hidden, any tab. */
export function useCodeCommentsHidden(): boolean {
  return useSyncExternalStore(subscribeCodeComments, commentsHidden, () => false);
}
