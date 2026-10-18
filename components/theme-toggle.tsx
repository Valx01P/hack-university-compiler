"use client";

import { useEffect, useRef, useState } from "react";
import {
  APP_THEMES,
  CONTRAST_LEVELS,
  setContrast,
  setTheme,
  useContrast,
  useTheme,
} from "@/lib/theme";
import { CodeBackgroundPicker } from "@/components/code/code-background";

/**
 * Header theme picker. The trigger shows the CURRENT theme's icon (sun for
 * Light, moon for Dark, snowflake for Nord, …); clicking it drops a small menu
 * of every theme, each with its own glyph, plus a Normal / High / Super
 * contrast picker that deepens whichever theme is active, and a code
 * background for every editor, code block, and terminal. Goes through
 * setTheme() so the `data-dark` flag and the editor's code theme stay in sync.
 * The icon starts as the Light sun on first paint (SSR) and corrects after
 * hydration — same pattern as the rest of the theme bootstrap, so there's no
 * markup mismatch.
 */
export function ThemeToggle() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const contrast = useContrast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme"
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex size-9 items-center justify-center rounded-btn transition-colors ${
          open ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised hover:text-ink"
        }`}
      >
        <ThemeIcon id={theme} className="size-5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-[60] w-60 overflow-hidden rounded-card border border-edge bg-surface py-1 shadow-(--shadow-card)"
        >
          {APP_THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "text-ink dark:text-gold"
                    : "text-ink-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <ThemeIcon id={t.id} className="size-4 shrink-0" />
                <span className="flex-1 text-left">{t.label}</span>
                {active && (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l4 4 9-10" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* A modifier, not a theme: picking a level keeps the menu open so
              you can see it apply, and it sticks as you switch themes. */}
          <div role="separator" className="my-1 h-px bg-edge" />
          <div role="group" aria-label="Contrast" className="px-3 pb-2 pt-1.5">
            <p className="flex items-center gap-2.5 text-sm text-ink-muted">
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
              </svg>
              Contrast
            </p>
            <div className="mt-2 flex rounded-btn border border-edge-strong p-0.5">
              {CONTRAST_LEVELS.map((c) => {
                const active = c.id === contrast;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => setContrast(c.id)}
                    className={`flex-1 rounded-[5px] px-1 py-1 text-xs font-medium transition-colors ${
                      active ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Also a modifier: one background for every editor, code block,
              and terminal, the syntax colors unchanged. */}
          <div role="separator" className="my-1 h-px bg-edge" />
          <div role="group" aria-label="Code background" className="px-3 pb-2.5 pt-1.5">
            <p className="flex items-center gap-2.5 text-sm text-ink-muted">
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
                <path d="M7.5 10l2.5 2-2.5 2M12.5 14.5h4" />
              </svg>
              Code background
            </p>
            <div className="mt-2.5">
              <CodeBackgroundPicker compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Per-theme glyph — a small visual cue for each theme in the trigger + menu. */
function ThemeIcon({ id, className }: { id: string; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "dark": // moon
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      );
    case "dracula": // blood droplet
      return (
        <svg {...common}>
          <path d="M12 3s5.2 5.6 5.2 9.2A5.2 5.2 0 0 1 6.8 12.2C6.8 8.6 12 3 12 3z" />
        </svg>
      );
    case "monokai": // flame
      return (
        <svg {...common}>
          <path d="M12 2.5c.7 3.6 4.2 4.6 4.2 9.1a4.2 4.2 0 1 1-8.4 0c0-1.5.7-2.6 1.6-3.5C10.6 9 12 7.6 12 2.5z" />
          <path d="M12 14.5a1.8 1.8 0 0 1-1.6-2.6c.5.6 1 .8 1.6 1 .9-.6 1.1-1.5 1-2.2.8.7 1.8 1.7 1.8 3a1.9 1.9 0 0 1-2.8 1.8" />
        </svg>
      );
    case "nord": // snowflake
      return (
        <svg {...common}>
          <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" />
          <path d="M12 2l-1.3 2M12 2l1.3 2M12 22l-1.3-2M12 22l1.3-2M3.5 7l2 .4M3.5 7l.4 2M20.5 17l-2-.4M20.5 17l-.4-2M20.5 7l-2 .4M20.5 7l-.4 2M3.5 17l2-.4M3.5 17l.4-2" />
        </svg>
      );
    case "solarized": // sun on the horizon
      return (
        <svg {...common}>
          <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 4.5v2M5 9.5 6.4 11M19 9.5 17.6 11" />
        </svg>
      );
    default: // "light" — sun
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
  }
}
