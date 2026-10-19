"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { CODE_BG_PRESETS, CODE_SEL_PRESETS, codeBackground, codeSelection } from "@/lib/theme";

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
    theme's, with the code background setting applied), as #rrggbb. */
function codeColors(): { ink: string | null; bg: string | null } {
  const probe = document.createElement("div");
  probe.className = "code-dark";
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
    attributeFilter: ["data-code-theme", "data-contrast", "data-code-bg", "style"],
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
    const key = `${kind}|${color}|${d.getAttribute("data-code-theme")}|${d.getAttribute("data-contrast")}|${d.style.getPropertyValue("--code-bg-override")}`;
    if (!warningCache.has(key)) warningCache.set(key, judge(color, codeColors()));
    return warningCache.get(key) ?? null;
  };
  return useSyncExternalStore(subscribeCodeColors, snapshot, () => null);
}

function judgeBackground(bg: string, { ink }: ReturnType<typeof codeColors>): string | null {
  return ink && contrast(bg, ink) < 4.5
    ? "The editor theme's text is hard to read on this color. Try another background or editor theme."
    : null;
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
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const customOn = value !== null && !presets.some((p) => p.value === value);
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
          title="Theme default"
          aria-label="Theme default"
          className={swatch(value === null)}
        >
          {themeSwatch}
        </button>
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
    if (value && !presets.some((p) => p.value === value) && value !== custom) setting.saveCustom(value);
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
 * Swatches for the selection color in every editor and code block: the
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
