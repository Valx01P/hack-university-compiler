"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { CODE_BG_PRESETS, CODE_SEL_PRESETS, SURFACE_GRAY, SURFACE_NONE, codeBackground, codeSelection, explorerBackground, explorerHighlight, termBackground } from "@/lib/theme";

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` laid over `bottom` at `amount` (0 to 1), as #rrggbb. */
function mix(top: string, bottom: string, amount: number): string {
  return `#${[1, 3, 5]
    .map((i) => {
      const v = Math.round(parseInt(top.slice(i, i + 2), 16) * amount + parseInt(bottom.slice(i, i + 2), 16) * (1 - amount));
      return v.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

/** The code surfaces' text and background colors right now (the editor
    theme's, with the code background setting applied), as #rrggbb, or a
    terminal's (its own colors, when the theme menu gave it some). */
function codeColors(terminal = false): { ink: string | null; bg: string | null } {
  const probe = document.createElement("div");
  probe.className = terminal ? "code-dark term-colors" : "code-dark";
  probe.hidden = true;
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const read = (name: string) => {
    const v = style.getPropertyValue(name).trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(v) ? v : null;
  };
  const colors = { ink: read("--code-ink"), bg: read("--code-bg") };
  probe.remove();
  return colors;
}

/**
 * A warning about a color, worked out while rendering so it's there (or not)
 * in the picker's first frame. Re-checked when the editor theme, contrast
 * level, or code background changes, since those set the colors it's judged
 * against, and cached between renders.
 */
const subscribeCodeColors = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-code-theme", "data-contrast", "data-code-bg", "data-term-colors", "style"],
  });
  return () => observer.disconnect();
};
const warningCache = new Map<string, string | null>();
function useColorWarning(
  kind: string,
  color: string | null,
  judge: (color: string, colors: ReturnType<typeof codeColors>) => string | null
) {
  const snapshot = () => {
    if (!color) return null;
    const d = document.documentElement;
    const key = `${kind}|${color}|${d.getAttribute("data-code-theme")}|${d.getAttribute("data-contrast")}|${d.getAttribute("data-term-colors")}|${d.style.getPropertyValue("--code-bg-override")}`;
    if (!warningCache.has(key)) warningCache.set(key, judge(color, codeColors(kind === "terminal")));
    return warningCache.get(key) ?? null;
  };
  return useSyncExternalStore(subscribeCodeColors, snapshot, () => null);
}

function judgeBackground(bg: string, { ink }: ReturnType<typeof codeColors>): string | null {
  return ink && contrast(bg, ink) < 4.5
    ? "The editor theme's text is hard to read on this color. Try another background or editor theme."
    : null;
}

function judgeTerminalBackground(bg: string, { ink }: ReturnType<typeof codeColors>): string | null {
  return ink && contrast(bg, ink) < 4.5 ? "The terminal's text is hard to read on this color. Try another background or terminal colors." : null;
}

// How strongly a selection color shows over the background (globals.css).
const SELECTION_STRENGTH = 0.4;

function judgeSelection(sel: string, { ink, bg }: ReturnType<typeof codeColors>): string | null {
  if (!ink || !bg) return null;
  const shown = mix(sel, bg, SELECTION_STRENGTH);
  if (contrast(shown, bg) < 1.25) return "Selections are hard to see on the code background with this color. Try a stronger one.";
  if (contrast(shown, ink) < 3) return "Selected text is hard to read with this color. Try another one.";
  return null;
}

/**
 * Round swatches for a code color: the theme's own, presets, and a custom
 * color. The custom swatch keeps the last color you picked even after you
 * switch to a preset: clicking it brings that color back, and clicking it
 * again (while it's on) opens the color picker to change it.
 */
function ColorSwatches({
  label,
  value,
  presets,
  custom,
  onPick,
  onPickCustom,
  themeSwatch,
  look,
  warning,
  compact,
  scope = "",
  themeLabel = "Theme default",
  named = [],
}: {
  label: string;
  value: string | null;
  presets: { value: string; label: string }[];
  /** The last custom color you picked, if any. */
  custom: string | null;
  onPick: (value: string | null) => void;
  onPickCustom: (value: string) => void;
  /** What "the theme's own" looks like. */
  themeSwatch: ReactNode;
  /** How a color looks where it's used, as a CSS background. */
  look: (color: string) => string;
  warning: string | null;
  compact: boolean;
  /** Classes for the swatch row, for colors that only resolve there. */
  scope?: string;
  /** What the first swatch (nothing set) is called. */
  themeLabel?: string;
  /** Swatches for values kept by name, after the first (the Explorer
      highlight's gray). */
  named?: { value: string; label: string; swatch: ReactNode }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const customOn = value !== null && !named.some((n) => n.value === value) && !presets.some((p) => p.value === value);
  const remembered = customOn ? value : custom;

  const swatch = (active: boolean) =>
    `relative inline-flex ${compact ? "size-5" : "size-6"} shrink-0 items-center justify-center rounded-full border transition-[box-shadow,border-color] ${
      active
        ? "border-transparent ring-2 ring-ink ring-offset-2 ring-offset-surface dark:ring-gold"
        : "border-edge-strong/40 hover:border-ink"
    }`;

  return (
    <div>
      <div role="radiogroup" aria-label={label} className={`${scope} flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onPick(null)}
          title={themeLabel}
          aria-label={themeLabel}
          className={swatch(value === null)}
        >
          {themeSwatch}
        </button>
        {named.map((n) => (
          <button
            key={n.value}
            type="button"
            role="radio"
            aria-checked={value === n.value}
            onClick={() => onPick(n.value)}
            title={n.label}
            aria-label={n.label}
            className={swatch(value === n.value)}
          >
            {n.swatch}
          </button>
        ))}
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={value === p.value}
            onClick={() => onPick(p.value)}
            title={`${p.label} ${p.value}`}
            aria-label={`${p.label} ${p.value}`}
            className={swatch(value === p.value)}
            style={{ background: look(p.value) }}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={customOn}
          onClick={() => (remembered && !customOn ? onPick(remembered) : inputRef.current?.click())}
          title={customOn ? `Custom ${value}, click to change it` : remembered ? `Custom ${remembered}` : "Custom color"}
          aria-label={customOn ? `Custom color ${value}, change it` : remembered ? `Custom color ${remembered}` : "Pick a custom color"}
          className={swatch(customOn)}
          style={remembered ? { background: look(remembered) } : undefined}
        >
          {remembered ? (
            // A rainbow dot marks the custom slot.
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-surface bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)]"
            />
          ) : (
            <span aria-hidden className="size-full rounded-full bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)]" />
          )}
        </button>
        <input
          ref={inputRef}
          id={id}
          type="color"
          tabIndex={-1}
          aria-hidden
          value={remembered ?? "#2a2d3a"}
          onChange={(e) => onPickCustom(e.target.value)}
          className="pointer-events-none absolute size-0 opacity-0"
        />
      </div>
      {warning && <p className="mt-2 text-xs leading-snug text-ink-muted">{warning}</p>}
    </div>
  );
}

/** Keeps a custom color in use as the remembered one too (a color picked
    before the picker remembered them, say). */
function useRememberCustom(
  setting: { saveCustom: (value: string) => void },
  value: string | null,
  presets: { value: string }[],
  custom: string | null
) {
  useEffect(() => {
    if (value?.startsWith("#") && !presets.some((p) => p.value === value) && value !== custom) setting.saveCustom(value);
  }, [setting, value, presets, custom]);
}

/**
 * Swatches for the code background: the theme's own, a few dark presets, and
 * a custom color. Shared by the header theme menu and the editor gear (they
 * stay in sync). It applies live, and it warns when the editor theme's text
 * would be hard to read on the chosen color.
 */
export function CodeBackgroundPicker({ compact = false }: { compact?: boolean }) {
  const value = codeBackground.use();
  const custom = codeBackground.useCustom();
  const warning = useColorWarning("background", value, judgeBackground);
  useRememberCustom(codeBackground, value, CODE_BG_PRESETS, custom);
  return (
    <ColorSwatches
      label="Code background"
      value={value}
      presets={CODE_BG_PRESETS}
      custom={custom}
      onPick={codeBackground.set}
      onPickCustom={(color) => {
        codeBackground.set(color);
        codeBackground.saveCustom(color);
      }}
      // Half page, half editor: whatever the theme uses.
      themeSwatch={
        <span aria-hidden className="size-full overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--surface)_50%,var(--code-bg)_50%)]" />
      }
      look={(color) => color}
      warning={warning}
      compact={compact}
    />
  );
}

/**
 * Swatches for the selection color (every selection in the app): the
 * theme's own, a few presets, and a custom color, each shown as it looks
 * over the code background. Shared by the header theme menu and the editor
 * gear. It warns when selections would be hard to see, or selected text
 * hard to read.
 */
export function SelectionColorPicker({ compact = false }: { compact?: boolean }) {
  const value = codeSelection.use();
  const custom = codeSelection.useCustom();
  const warning = useColorWarning("selection", value, judgeSelection);
  useRememberCustom(codeSelection, value, CODE_SEL_PRESETS, custom);
  return (
    <ColorSwatches
      label="Selection color"
      value={value}
      presets={CODE_SEL_PRESETS}
      custom={custom}
      onPick={codeSelection.set}
      onPickCustom={(color) => {
        codeSelection.set(color);
        codeSelection.saveCustom(color);
      }}
      // The theme's own selection, over the code background.
      themeSwatch={
        <span
          aria-hidden
          className="size-full overflow-hidden rounded-full"
          style={{ background: "linear-gradient(var(--code-selection), var(--code-selection)), var(--code-bg)" }}
        />
      }
      look={(color) => `color-mix(in oklab, ${color} ${SELECTION_STRENGTH * 100}%, var(--code-bg))`}
      warning={warning}
      compact={compact}
      // The editor theme's colors (with the code background) resolve on a
      // code surface, and this one keeps the theme's own selection.
      scope="code-dark code-sel-own"
    />
  );
}

/** The page's text color right now, as #rrggbb. */
function pageInk(): string | null {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

function judgeExplorer(bg: string): string | null {
  const ink = pageInk();
  return ink && contrast(bg, ink) < 4.5 ? "The file names are hard to read on this color. Try another one." : null;
}

// How strongly the Explorer's highlight shows over its background (globals.css).
const HIGHLIGHT_STRENGTH = 0.4;

/** The Explorer's background right now (its own color, else the panel's), as #rrggbb. */
function explorerBase(): string | null {
  const d = document.documentElement;
  const own = d.hasAttribute("data-explorer-bg") ? d.style.getPropertyValue("--explorer-bg").trim().toLowerCase() : "";
  const v = own || getComputedStyle(d).getPropertyValue("--surface").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

function judgeHighlight(color: string): string | null {
  if (!color.startsWith("#")) return null;
  const ink = pageInk();
  const base = explorerBase();
  if (!ink || !base) return null;
  return contrast(mix(color, base, HIGHLIGHT_STRENGTH), ink) < 4.5 ? "The open file's name is hard to read on this color. Try another one." : null;
}

/**
 * Swatches for the Explorer's highlight, its open file's row: none (the row
 * unfilled, to begin with), the gray, the selection's presets, and a custom
 * color, each shown as the tint it gives. It applies to every Explorer, the
 * IDE's too.
 */
export function ExplorerHighlightPicker({ compact = false }: { compact?: boolean }) {
  // None is what it has unset ("none" saved before it was).
  const set = explorerHighlight.use();
  const value = set === SURFACE_NONE ? null : set;
  const custom = explorerHighlight.useCustom();
  const warning = useSyncExternalStore(subscribeCodeColors, () => (value ? judgeHighlight(value) : null), () => null);
  useRememberCustom(explorerHighlight, value, CODE_SEL_PRESETS, custom);
  return (
    <ColorSwatches
      label="Explorer highlight"
      value={value}
      presets={CODE_SEL_PRESETS}
      custom={custom}
      onPick={explorerHighlight.set}
      onPickCustom={(color) => {
        explorerHighlight.set(color);
        explorerHighlight.saveCustom(color);
      }}
      // None: an empty ring, struck through. Then the gray, by name.
      themeSwatch={<span aria-hidden className="absolute inset-0 m-auto h-px w-[70%] -rotate-45 rounded-full bg-ink-muted" />}
      themeLabel="None"
      named={[{ value: SURFACE_GRAY, label: "Gray", swatch: <span aria-hidden className="size-full rounded-full bg-raised" /> }]}
      look={(color) => `color-mix(in oklab, ${color} ${HIGHLIGHT_STRENGTH * 100}%, var(--surface))`}
      warning={warning}
      compact={compact}
    />
  );
}

/**
 * Swatches for the terminal's own background (the theme menu): the theme's
 * own (its colors' background, see-through with the stars), the code
 * background's presets, and a custom color. It applies live to every terminal, the IDE's too.
 */
export function TerminalBackgroundPicker({ compact = false }: { compact?: boolean }) {
  const value = termBackground.use();
  const custom = termBackground.useCustom();
  const warning = useColorWarning("terminal", value, judgeTerminalBackground);
  useRememberCustom(termBackground, value, CODE_BG_PRESETS, custom);
  return (
    <ColorSwatches
      label="Terminal background"
      value={value}
      presets={CODE_BG_PRESETS}
      custom={custom}
      onPick={termBackground.set}
      onPickCustom={(color) => {
        termBackground.set(color);
        termBackground.saveCustom(color);
      }}
      // The theme's own, as it shows: the terminal's background (its own
      // colors', or the code background), or nothing there (an empty ring)
      // while the stars make it see-through.
      themeSwatch={<span aria-hidden className="code-dark term-colors theme-surface-swatch size-full rounded-full bg-(--code-bg)" />}
      look={(color) => color}
      warning={warning}
      compact={compact}
    />
  );
}

/**
 * Swatches for the Explorer's own background: the theme's own (the panel's,
 * see-through with the stars), a few presets, and a custom color. It applies to every
 * Explorer, the IDE's too.
 */
export function ExplorerBackgroundPicker({ compact = false }: { compact?: boolean }) {
  const value = explorerBackground.use();
  const custom = explorerBackground.useCustom();
  const warning = useSyncExternalStore(subscribeCodeColors, () => (value ? judgeExplorer(value) : null), () => null);
  useRememberCustom(explorerBackground, value, CODE_BG_PRESETS, custom);
  return (
    <ColorSwatches
      label="Explorer background"
      value={value}
      presets={CODE_BG_PRESETS}
      custom={custom}
      onPick={explorerBackground.set}
      onPickCustom={(color) => {
        explorerBackground.set(color);
        explorerBackground.saveCustom(color);
      }}
      themeSwatch={<span aria-hidden className="theme-surface-swatch size-full rounded-full bg-surface" />}
      look={(color) => color}
      warning={warning}
      compact={compact}
    />
  );
}
