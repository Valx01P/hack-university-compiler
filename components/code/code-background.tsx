"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CODE_BG_PRESETS, setCodeBackground, useCodeBackground } from "@/lib/theme";

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

/** The active editor theme's text color, as #rrggbb, or null. */
function editorInk(): string | null {
  const probe = document.createElement("div");
  probe.className = "code-dark";
  probe.hidden = true;
  document.body.appendChild(probe);
  const ink = getComputedStyle(probe).getPropertyValue("--code-ink").trim().toLowerCase();
  probe.remove();
  return /^#[0-9a-f]{6}$/.test(ink) ? ink : null;
}

/**
 * Whether the editor theme's text is hard to read on `bg`. Re-checked when the
 * editor theme or contrast level changes, since those set the text color.
 */
function useLowContrast(bg: string | null): boolean {
  const [low, setLow] = useState(false);
  useEffect(() => {
    const check = () => {
      const ink = bg ? editorInk() : null;
      setLow(Boolean(bg && ink && contrast(bg, ink) < 4.5));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-code-theme", "data-contrast"] });
    return () => observer.disconnect();
  }, [bg]);
  return low;
}

/**
 * Swatches for the code background: the theme's own, a few dark presets, and
 * a custom color. Shared by the header theme menu and the editor gear (they
 * stay in sync). It applies live, and it warns when the editor theme's text
 * would be hard to read on the chosen color.
 */
export function CodeBackgroundPicker({ compact = false }: { compact?: boolean }) {
  const value = useCodeBackground();
  const low = useLowContrast(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const custom = value && !CODE_BG_PRESETS.some((p) => p.value === value) ? value : null;
  const [lastCustom, setLastCustom] = useState("#2a2d3a");
  useEffect(() => {
    if (custom) setLastCustom(custom);
  }, [custom]);

  const swatch = (active: boolean) =>
    `relative inline-flex ${compact ? "size-5" : "size-6"} shrink-0 items-center justify-center rounded-full border transition-[box-shadow,border-color] ${
      active
        ? "border-transparent ring-2 ring-ink ring-offset-2 ring-offset-surface dark:ring-gold"
        : "border-edge-strong/40 hover:border-ink"
    }`;

  return (
    <div>
      <div role="radiogroup" aria-label="Code background" className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => setCodeBackground(null)}
          title="Theme default"
          aria-label="Theme default"
          className={swatch(value === null)}
        >
          {/* Half page, half editor: whatever the theme uses. */}
          <span aria-hidden className="size-full overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--surface)_50%,var(--code-bg)_50%)]" />
        </button>
        {CODE_BG_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={value === p.value}
            onClick={() => setCodeBackground(p.value)}
            title={`${p.label} ${p.value}`}
            aria-label={`${p.label} ${p.value}`}
            className={swatch(value === p.value)}
            style={{ backgroundColor: p.value }}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom !== null}
          onClick={() => inputRef.current?.click()}
          title={custom ? `Custom ${custom}` : "Custom color"}
          aria-label={custom ? `Custom color ${custom}` : "Custom color"}
          className={swatch(custom !== null)}
          style={custom ? { backgroundColor: custom } : undefined}
        >
          {!custom && (
            <span aria-hidden className="size-full rounded-full bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)]" />
          )}
        </button>
        <input
          ref={inputRef}
          id={id}
          type="color"
          tabIndex={-1}
          aria-hidden
          value={custom ?? lastCustom}
          onChange={(e) => setCodeBackground(e.target.value)}
          className="pointer-events-none absolute size-0 opacity-0"
        />
      </div>
      {low && (
        <p className="mt-2 text-xs leading-snug text-ink-muted">
          The editor theme&apos;s text is hard to read on this color. Try another background or editor theme.
        </p>
      )}
    </div>
  );
}
