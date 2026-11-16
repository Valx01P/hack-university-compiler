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
/** The theme until you pick one. Keep in sync with the bootstrap in
    app/layout.tsx and the server markup's <html data-theme>. */
export const DEFAULT_THEME = "dark";

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
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
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
  return useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);
}

/**
 * Contrast is a modifier on top of whichever theme is active: every page theme
 * and editor theme has a deeper High variant and an even stronger Super
 * variant in globals.css, keyed off <html data-contrast="high" | "super">
 * (no attribute = Normal). Until you pick, it's Super (DEFAULT_CONTRAST, set
 * before first paint by the bootstrap in app/layout.tsx). Every pick is
 * saved, Normal included.
 */
export type ContrastLevel = "normal" | "high" | "super";

export const CONTRAST_LEVELS: { id: ContrastLevel; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "super", label: "Super" },
];

export const CONTRAST_KEY = "hu-contrast";
export const CONTRAST_EVENT = "hu:contrast-changed";

export const DEFAULT_CONTRAST: ContrastLevel = "super";

/** The level <html> shows (no attribute is Normal). */
function shownLevel(value: string | null): ContrastLevel {
  return value === "high" || value === "super" ? value : "normal";
}
/** The level you saved, else the default. */
function savedLevel(value: string | null): ContrastLevel {
  return value === "normal" || value === "high" || value === "super" ? value : DEFAULT_CONTRAST;
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
const subscribeContrast = subscribeTo(CONTRAST_EVENT, CONTRAST_KEY, (stored) => applyContrast(savedLevel(stored)));
const currentContrast = () => shownLevel(document.documentElement.getAttribute("data-contrast"));
export function useContrast(): ContrastLevel {
  return useSyncExternalStore(subscribeContrast, currentContrast, () => DEFAULT_CONTRAST);
}

/**
 * Code colors: settings that recolor every code surface (the editors, the
 * code blocks, and the output terminal) on top of whichever editor theme and
 * contrast level is active. Each is stored as a #rrggbb color (no key = the
 * theme's own) and applied before first paint by the bootstrap in
 * app/layout.tsx, as an <html> attribute plus a CSS variable. Each also
 * remembers the last custom color you picked, so it stays one click away
 * after you switch to a preset, until you pick another.
 *
 * - Code background (data-code-bg, --code-bg-override): one background for
 *   all of them. Their text and syntax colors stay the editor theme's.
 * - Selection (data-code-sel, --code-sel-override): the color selected text
 *   is highlighted with, drawn at 40% over the background (globals.css), so
 *   the text stays readable on dark and light editor themes alike. Blue
 *   until you pick another, and "theme" when you pick the theme's own.
 */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A valid #rrggbb color, lowercased, or null. */
export function toHexColor(value: string | null | undefined): string | null {
  return value && HEX_COLOR.test(value) ? value.toLowerCase() : null;
}

/** `fallback`: the color with nothing saved (null: the theme's own). With
    one, picking the theme's own is saved as "theme". */
function colorSetting(key: string, attr: string, cssVar: string, fallback: string | null = null) {
  const event = `hu:${key}-changed`;
  const customKey = `${key}-custom`;
  const customEvent = `hu:${customKey}-changed`;

  function apply(value: string | null) {
    const d = document.documentElement;
    if (value) {
      d.setAttribute(attr, "");
      d.style.setProperty(cssVar, value);
    } else {
      d.removeAttribute(attr);
      d.style.removeProperty(cssVar);
    }
  }

  /** Set the color (null = the theme's own), persist it, and broadcast to
      every picker. */
  function set(value: string | null) {
    const color = toHexColor(value);
    apply(color);
    try {
      if (color === fallback) localStorage.removeItem(key);
      else localStorage.setItem(key, color ?? "theme");
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new Event(event));
    } catch {
      /* ignore */
    }
  }

  function current(): string | null {
    const d = document.documentElement;
    return d.hasAttribute(attr) ? toHexColor(d.style.getPropertyValue(cssVar).trim()) : null;
  }

  const subscribe = subscribeTo(event, key, (stored) => apply(stored === "theme" ? null : (toHexColor(stored) ?? fallback)));
  /** The color (null = the theme's own), any tab. */
  function use(): string | null {
    return useSyncExternalStore(subscribe, current, () => fallback);
  }

  /** Remember a custom color you picked. */
  function saveCustom(value: string) {
    const color = toHexColor(value);
    if (!color) return;
    try {
      localStorage.setItem(customKey, color);
      window.dispatchEvent(new Event(customEvent));
    } catch {
      /* ignore */
    }
  }
  const readCustom = () => {
    try {
      return toHexColor(localStorage.getItem(customKey));
    } catch {
      return null;
    }
  };
  const subscribeCustom = subscribeTo(customEvent, customKey);
  /** The last custom color you picked, if any, any tab. */
  function useCustom(): string | null {
    return useSyncExternalStore(subscribeCustom, readCustom, () => null);
  }

  return { set, use, saveCustom, useCustom };
}

export const CODE_BG_PRESETS: { value: string; label: string }[] = [
  { value: "#2e2f34", label: "Graphite" },
  { value: "#1c2030", label: "Navy" },
  { value: "#0d1117", label: "Ink" },
  { value: "#1e1e1e", label: "Charcoal" },
  { value: "#282c34", label: "Slate" },
  { value: "#000000", label: "Black" },
];
export const CODE_BG_KEY = "hu-code-bg";
export const codeBackground = colorSetting(CODE_BG_KEY, "data-code-bg", "--code-bg-override");
export const setCodeBackground = codeBackground.set;
export const useCodeBackground = codeBackground.use;

export const CODE_SEL_PRESETS: { value: string; label: string }[] = [
  { value: "#388bfd", label: "Blue" },
  { value: "#a371f7", label: "Purple" },
  { value: "#2ea043", label: "Green" },
  { value: "#d29922", label: "Amber" },
  { value: "#db61a2", label: "Pink" },
  { value: "#8b949e", label: "Gray" },
];
export const CODE_SEL_KEY = "hu-code-sel";
export const CODE_SEL_DEFAULT = "#388bfd";
export const codeSelection = colorSetting(CODE_SEL_KEY, "data-code-sel", "--code-sel-override", CODE_SEL_DEFAULT);
export const setCodeSelection = codeSelection.set;
export const useCodeSelection = codeSelection.use;

/**
 * Line visibility settings, from 0 (hidden) to 100 (the theme's own), each
 * stored as a number and applied before first paint by the bootstrap in
 * app/layout.tsx as a percentage variable on <html>. Both start at 0, a
 * borderless page (globals.css falls back to 0% too):
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

/** A 0 to 100 setting kept as a percentage variable on <html>, stored only
    when it differs from its default. */
function percentSetting(key: string, cssVar: string, fallback = 100) {
  const event = `hu:${key}-changed`;
  const toPct = (value: unknown): number => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
  };
  const current = () => {
    const v = document.documentElement.style.getPropertyValue(cssVar).trim();
    return v ? toPct(v.replace("%", "")) : fallback;
  };

  /** Set the value (0 to 100), persist it, and broadcast. */
  function set(value: number) {
    const pct = toPct(value);
    document.documentElement.style.setProperty(cssVar, `${pct}%`);
    try {
      if (pct === fallback) localStorage.removeItem(key);
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

  /** Subscribe to the value (0 to 100), any tab. */
  const subscribe = subscribeTo(event, key, (stored) =>
    document.documentElement.style.setProperty(cssVar, `${toPct(stored ?? fallback)}%`)
  );
  function use(): number {
    return useSyncExternalStore(subscribe, current, () => fallback);
  }

  return { set, use };
}

const layoutLines = percentSetting(LAYOUT_LINES_KEY, "--layout-lines", 0);
export const setLayoutLines = layoutLines.set;
export const useLayoutLines = layoutLines.use;

const contentLines = percentSetting(CONTENT_LINES_KEY, "--content-lines", 0);
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

/**
 * The shade along the bottom of a Learn part, behind its floating Previous and
 * Next: on (the default) or off. Off is <html data-learn-shade="off">, applied
 * before first paint by the bootstrap in app/layout.tsx, and CSS drops the
 * shade there (globals.css .learn-shade).
 */
export const LEARN_SHADE_KEY = "hu-learn-shade";
const LEARN_SHADE_EVENT = "hu:learn-shade-changed";

const learnShadeOn = () => document.documentElement.getAttribute("data-learn-shade") !== "off";

function applyLearnShade(on: boolean) {
  if (on) document.documentElement.removeAttribute("data-learn-shade");
  else document.documentElement.setAttribute("data-learn-shade", "off");
}

/** Show or hide the shade, persist it, and broadcast. */
export function setLearnShade(on: boolean) {
  applyLearnShade(on);
  try {
    if (on) localStorage.removeItem(LEARN_SHADE_KEY);
    else localStorage.setItem(LEARN_SHADE_KEY, "off");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(LEARN_SHADE_EVENT));
  } catch {
    /* ignore */
  }
}

const subscribeLearnShade = subscribeTo(LEARN_SHADE_EVENT, LEARN_SHADE_KEY, (stored) => applyLearnShade(stored !== "off"));

/** Whether the bottom shade shows, any tab. */
export function useLearnShade(): boolean {
  return useSyncExternalStore(subscribeLearnShade, learnShadeOn, () => true);
}

/** A switch that hides something everywhere in the app, kept as
    <html attr="hidden"> and stored ("hidden" or "shown") only when it differs
    from its default. */
function hiddenSetting(key: string, attr: string, hiddenByDefault: boolean) {
  const event = `hu:${key}-changed`;
  const saved = (stored: string | null) => (stored === "hidden" ? true : stored === "shown" ? false : hiddenByDefault);
  const current = () => document.documentElement.getAttribute(attr) === "hidden";
  const apply = (hidden: boolean) => {
    if (hidden) document.documentElement.setAttribute(attr, "hidden");
    else document.documentElement.removeAttribute(attr);
  };

  /** Hide or show it, persist it, and broadcast. */
  function set(hidden: boolean) {
    apply(hidden);
    try {
      if (hidden === hiddenByDefault) localStorage.removeItem(key);
      else localStorage.setItem(key, hidden ? "hidden" : "shown");
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new Event(event));
    } catch {
      /* ignore */
    }
  }

  const subscribe = subscribeTo(event, key, (stored) => apply(saved(stored)));
  /** Whether it's hidden, any tab. */
  function use(): boolean {
    return useSyncExternalStore(subscribe, current, () => hiddenByDefault);
  }

  return { set, use };
}

/**
 * Scrollbars: hidden (the default) or shown everywhere in the app, the page
 * and every pane, list, editor, code block, output, and terminal, which all
 * still scroll by wheel, trackpad, touch, and keys. Hidden is
 * <html data-scrollbars="hidden">, applied before first paint by the
 * bootstrap in app/layout.tsx, and CSS drops every scrollbar there
 * (globals.css).
 */
export const SCROLLBARS_KEY = "hu-scrollbars";
const scrollbars = hiddenSetting(SCROLLBARS_KEY, "data-scrollbars", true);
export const setScrollbarsHidden = scrollbars.set;
export const useScrollbarsHidden = scrollbars.use;

/**
 * Tooltips: the hints that pop up when you hover something, and every one in
 * the app is a title attribute (buttons and links, draggable borders, the
 * editors' type error underlines). Hidden by default, or shown:
 * <html data-tooltips="hidden">, applied before first paint by the bootstrap
 * in app/layout.tsx, and while it's on components/chrome/tooltip-guard.tsx
 * keeps every title off the page, and puts them back when it's turned off.
 */
export const TOOLTIPS_KEY = "hu-tooltips";
const tooltips = hiddenSetting(TOOLTIPS_KEY, "data-tooltips", true);
export const setTooltipsHidden = tooltips.set;
export const useTooltipsHidden = tooltips.use;

/**
 * The highlight a draggable border shows under the pointer and while it's
 * dragged (components/ui/resize-handle.tsx and the compiler's split):
 * hidden by default, so only the cursor changes, or shown. Hidden is
 * <html data-resize-highlight="hidden">, applied before first paint by the
 * bootstrap in app/layout.tsx, and the handle-hover and handle-active
 * variants in globals.css stop matching there. A border focused from the
 * keyboard keeps its highlight.
 */
export const RESIZE_HIGHLIGHT_KEY = "hu-resize-highlight";
const resizeHighlight = hiddenSetting(RESIZE_HIGHLIGHT_KEY, "data-resize-highlight", true);
export const setResizeHighlightHidden = resizeHighlight.set;
export const useResizeHighlightHidden = resizeHighlight.use;

/**
 * Stars: a starry background behind the app (components/chrome/starfield.tsx),
 * on by default (turning them off is saved as "off"). On is <html data-stars>,
 * applied before first paint by the bootstrap in app/layout.tsx, and while
 * it's on the app's large backgrounds, code editors and code blocks included,
 * let the stars through (globals.css). Their brightness and amount are 0 to
 * 100 settings, like the line sliders, at 70% and 50% to begin with.
 */
export const STARS_KEY = "hu-stars";
const STARS_EVENT = "hu:stars-changed";

const starsShown = () => document.documentElement.hasAttribute("data-stars");

function applyStars(on: boolean) {
  if (on) document.documentElement.setAttribute("data-stars", "");
  else document.documentElement.removeAttribute("data-stars");
}

/** Turn the stars on or off, persist it, and broadcast. */
export function setStarsOn(on: boolean) {
  applyStars(on);
  try {
    if (on) localStorage.removeItem(STARS_KEY);
    else localStorage.setItem(STARS_KEY, "off");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(STARS_EVENT));
  } catch {
    /* ignore */
  }
}

const subscribeStars = subscribeTo(STARS_EVENT, STARS_KEY, (stored) => applyStars(stored !== "off"));

/** Whether the stars are on, any tab. */
export function useStarsOn(): boolean {
  return useSyncExternalStore(subscribeStars, starsShown, () => true);
}

export const STARS_BRIGHTNESS_KEY = "hu-stars-brightness";
export const STARS_AMOUNT_KEY = "hu-stars-amount";

const starsBrightness = percentSetting(STARS_BRIGHTNESS_KEY, "--stars-brightness", 70);
export const setStarsBrightness = starsBrightness.set;
export const useStarsBrightness = starsBrightness.use;

const starsAmount = percentSetting(STARS_AMOUNT_KEY, "--stars-amount", 50);
export const setStarsAmount = starsAmount.set;
export const useStarsAmount = starsAmount.use;

/** A setting that is one of a fixed set of ids, kept as an attribute on
    <html> and stored only when it differs from its default. */
function choiceSetting<T extends string>(key: string, attr: string, ids: readonly T[], fallback: T) {
  const event = `hu:${key}-changed`;
  const valid = (value: unknown): T => (ids.includes(value as T) ? (value as T) : fallback);
  const current = () => valid(document.documentElement.getAttribute(attr));
  const apply = (value: T) => {
    if (value === fallback) document.documentElement.removeAttribute(attr);
    else document.documentElement.setAttribute(attr, value);
  };

  /** Pick one, persist it, and broadcast. */
  function set(value: T) {
    const id = valid(value);
    apply(id);
    try {
      if (id === fallback) localStorage.removeItem(key);
      else localStorage.setItem(key, id);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new Event(event));
    } catch {
      /* ignore */
    }
  }

  const subscribe = subscribeTo(event, key, (stored) => apply(valid(stored)));
  function use(): T {
    return useSyncExternalStore(subscribe, current, () => fallback);
  }

  return { set, use };
}

/**
 * Clouds: the soft glow drawn with the stars. One of five versions, how much
 * of it there is (0 to 100, none at 0), and where on the screen it gathers,
 * each applied before first paint by the bootstrap in app/layout.tsx and
 * saved in this browser. Wisps at the top is the homepage of
 * hackuniversity.dev.
 */
export const CLOUD_STYLES = [
  { id: "wisps", label: "Wisps" },
  { id: "swirl", label: "Swirl" },
  { id: "band", label: "Band" },
  { id: "bloom", label: "Bloom" },
  { id: "aurora", label: "Aurora" },
] as const;
export type CloudStyle = (typeof CLOUD_STYLES)[number]["id"];

export const CLOUD_PLACES = [
  { id: "top-left", label: "Top left" },
  { id: "top", label: "Top" },
  { id: "top-right", label: "Top right" },
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom", label: "Bottom" },
  { id: "bottom-right", label: "Bottom right" },
] as const;
export type CloudPlace = (typeof CLOUD_PLACES)[number]["id"];

export const CLOUDS_KEY = "hu-clouds";
const cloudStyle = choiceSetting<CloudStyle>(CLOUDS_KEY, "data-clouds", CLOUD_STYLES.map((c) => c.id), "wisps");
export const setCloudStyle = cloudStyle.set;
export const useCloudStyle = cloudStyle.use;

export const CLOUDS_PLACE_KEY = "hu-clouds-place";
const cloudPlace = choiceSetting<CloudPlace>(CLOUDS_PLACE_KEY, "data-clouds-place", CLOUD_PLACES.map((c) => c.id), "top");
export const setCloudPlace = cloudPlace.set;
export const useCloudPlace = cloudPlace.use;

export const CLOUDS_AMOUNT_KEY = "hu-clouds-amount";
const cloudsAmount = percentSetting(CLOUDS_AMOUNT_KEY, "--clouds-amount", 50);
export const setCloudsAmount = cloudsAmount.set;
export const useCloudsAmount = cloudsAmount.use;
