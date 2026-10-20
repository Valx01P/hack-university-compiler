"use client";

import { useEffect, useRef, useState } from "react";
import {
  APP_THEMES,
  CLOUD_PLACES,
  CLOUD_STYLES,
  CONTRAST_LEVELS,
  setContrast,
  setLayoutLines,
  setContentLines,
  setCloudPlace,
  setCloudStyle,
  setCloudsAmount,
  setCodeCommentsHidden,
  setLearnShade,
  setStarsAmount,
  setStarsBrightness,
  setStarsOn,
  setTheme,
  useContrast,
  useLayoutLines,
  useContentLines,
  useCloudPlace,
  useCloudStyle,
  useCloudsAmount,
  useCodeCommentsHidden,
  useLearnShade,
  useStarsAmount,
  useStarsBrightness,
  useStarsOn,
  useTheme,
} from "@/lib/theme";
import { SwitchTrack } from "@/components/ui/switch-track";
import { CodeBackgroundPicker, SelectionColorPicker } from "@/components/code/code-background";
import { POP, usePresence } from "@/lib/motion";

/**
 * Header theme picker. The trigger shows the CURRENT theme's icon (sun for
 * Light, moon for Dark, snowflake for Nord, …); clicking it drops a small menu
 * of every theme, each with its own glyph, plus a Normal / High / Super
 * contrast picker that deepens whichever theme is active, and a code
 * background for every editor, code block, and terminal, how visible lines
 * are, whether code examples show their comments, the shade along the bottom
 * of Learn, and the stars behind the app with their brightness and amount and
 * the clouds' version, cover, and place. Goes through setTheme() so the
 * `data-dark` flag and the editor's code theme stay in sync.
 * The icon starts as the Light sun on first paint (SSR) and corrects after
 * hydration — same pattern as the rest of the theme bootstrap, so there's no
 * markup mismatch. `floating` is the button in full screen, where the header
 * is covered: round, its menu opening upward (components/chrome/floating-nav.tsx
 * places it at the bottom right).
 */
export function ThemeToggle({ floating = false }: { floating?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const contrast = useContrast();
  const lines = useLayoutLines();
  const contentLines = useContentLines();
  const commentsShown = !useCodeCommentsHidden();
  const shadeOn = useLearnShade();
  const starsOn = useStarsOn();
  const starsBrightness = useStarsBrightness();
  const starsAmount = useStarsAmount();
  const cloudStyle = useCloudStyle();
  const cloudPlace = useCloudPlace();
  const cloudCover = useCloudsAmount();
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuShown = usePresence(open, menuRef, POP);

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
        className={
          floating
            ? `float-btn inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface shadow-(--shadow-card) transition-colors ${
                open ? "text-ink" : "text-ink-muted hover:text-ink"
              }`
            : `inline-flex size-9 items-center justify-center rounded-btn transition-colors ${
                open ? "bg-highlight text-ink" : "text-ink-muted hover:bg-highlight hover:text-ink"
              }`
        }
      >
        <ThemeIcon id={theme} className="size-5" />
      </button>

      {menuShown && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Theme"
          style={{ transformOrigin: floating ? "bottom right" : "top right" }}
          className={`slim-scroll absolute right-0 z-[60] w-[22rem] max-w-[calc(100vw-2rem)] sm:w-[40rem] overflow-y-auto rounded-card border border-edge bg-surface py-1 shadow-(--shadow-card) ${
            floating ? "bottom-[calc(100%+0.5rem)] max-h-[calc(100dvh-5rem)]" : "top-[calc(100%+0.4rem)] max-h-[calc(100dvh-4.5rem)]"
          }`}
        >
          {/* Two columns on wider screens, so it all fits without
              scrolling: how things look on the left, lines and the sky on
              the right. On a phone they stack. */}
          <div className="sm:grid sm:grid-cols-2 sm:divide-x sm:divide-edge">
            <div>
              {/* The themes, in two columns. */}
              <div className="grid grid-cols-2">
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
                          : "text-ink-muted hover:bg-highlight hover:text-ink"
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
              </div>

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

              {/* And the color selected code is highlighted with. */}
              <div role="group" aria-label="Selection color" className="px-3 pb-2.5 pt-1.5">
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
                    <rect x="3.5" y="8" width="11" height="8" rx="1.5" fill="currentColor" fillOpacity={0.25} stroke="none" />
                    <path d="M17 5v14M15 5h4M15 19h4" />
                  </svg>
                  Selection color
                </p>
                <div className="mt-2.5">
                  <SelectionColorPicker compact />
                </div>
              </div>

              {/* Comments in lesson and cheatsheet examples, for reading the code
                  alone (running an example prints its results anyway). */}
              <div role="separator" className="my-1 h-px bg-edge" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={commentsShown}
                onClick={() => setCodeCommentsHidden(commentsShown)}
                className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-highlight hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M10.5 5 6.5 19M17.5 5l-4 14" />
                </svg>
                <span className="flex-1">
                  <span className="block">Code comments</span>
                  <span className="mt-0.5 block text-xs text-ink-faint">In lesson and cheatsheet examples</span>
                </span>
                <SwitchTrack on={commentsShown} className="mt-0.5" />
              </button>

              {/* The shade along the bottom of a Learn part, behind its
                  Previous and Next. */}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={shadeOn}
                onClick={() => setLearnShade(!shadeOn)}
                className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-highlight hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  aria-hidden
                >
                  <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                  <path d="M3.5 15.5h17" />
                  <rect x="3.5" y="15.5" width="17" height="4" rx="1" fill="currentColor" fillOpacity={0.35} stroke="none" />
                </svg>
                <span className="flex-1">
                  <span className="block">Bottom shade</span>
                  <span className="mt-0.5 block text-xs text-ink-faint">Behind Previous and Next in Learn</span>
                </span>
                <SwitchTrack on={shadeOn} className="mt-0.5" />
              </button>
            </div>
            <div>
              {/* How visible the layout's big lines are, and, separately, the
                  lines inside the content, each down to none. */}
              <div role="separator" className="my-1 h-px bg-edge sm:hidden" />
              <PercentSlider
                id="layout-lines"
                label="Layout lines"
                hint="Panels, sidebars, outlined buttons"
                value={lines}
                onChange={setLayoutLines}
                icon={
                  <>
                    <rect x="3" y="4.5" width="18" height="15" rx="2.5" strokeDasharray="3 2.5" />
                    <path d="M9 4.5v15" />
                  </>
                }
              />
              <PercentSlider
                id="content-lines"
                label="Content lines"
                hint="Tables, code, search boxes, dividers"
                value={contentLines}
                onChange={setContentLines}
                icon={
                  <>
                    <rect x="3" y="4.5" width="18" height="15" rx="2" />
                    <path d="M3 9.5h18M3 14.5h18M10 4.5v15" />
                  </>
                }
              />

              {/* A starry sky behind the app, then how bright it is and how
                  many stars it has. */}
              <div role="separator" className="my-1 h-px bg-edge" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={starsOn}
                onClick={() => setStarsOn(!starsOn)}
                className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-highlight hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z" />
                  <path d="M18.5 15.5v4M16.5 17.5h4" />
                </svg>
                <span className="flex-1">
                  <span className="block">Stars</span>
                  <span className="mt-0.5 block text-xs text-ink-faint">A starry sky behind the app</span>
                </span>
                <SwitchTrack on={starsOn} className="mt-0.5" />
              </button>
              {starsOn && (
                <>
                  <div className="grid grid-cols-2">
                    <PercentSlider
                      id="stars-brightness"
                      label="Brightness"
                      value={starsBrightness}
                      onChange={setStarsBrightness}
                      icon={
                        <>
                          <circle cx="12" cy="12" r="3.5" />
                          <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
                        </>
                      }
                    />
                    <PercentSlider
                      id="stars-amount"
                      label="Amount"
                      value={starsAmount}
                      onChange={setStarsAmount}
                      icon={
                        <>
                          <circle cx="6" cy="7" r="1.25" fill="currentColor" stroke="none" />
                          <circle cx="16.5" cy="5.5" r="1.25" fill="currentColor" stroke="none" />
                          <circle cx="11" cy="12" r="1.25" fill="currentColor" stroke="none" />
                          <circle cx="18.5" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
                          <circle cx="7" cy="18" r="1.25" fill="currentColor" stroke="none" />
                        </>
                      }
                    />
                  </div>

                  {/* The clouds drawn with the stars: one of five versions,
                      how much of them, and where on the screen they gather. */}
                  <div role="group" aria-label="Clouds" className="px-3 pb-2 pt-1.5">
                    <p className="flex items-center gap-2.5 text-sm text-ink-muted">
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M7 18.5h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 9.4 4.6 4.6 0 0 0 7 18.5z" />
                      </svg>
                      Clouds
                    </p>
                    <div className="mt-2 flex rounded-btn border border-edge-strong p-0.5">
                      {CLOUD_STYLES.map((c) => {
                        const active = c.id === cloudStyle;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            onClick={() => setCloudStyle(c.id)}
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
                  <div className="grid grid-cols-2">
                    <PercentSlider
                      id="clouds-cover"
                      label="Cover"
                      value={cloudCover}
                      onChange={setCloudsAmount}
                      icon={
                        <>
                          <path d="M5 15.5h9a3.25 3.25 0 0 0 .3-6.49A5 5 0 0 0 4.6 8.2 3.7 3.7 0 0 0 5 15.5z" />
                          <path d="M9 19h11" />
                        </>
                      }
                    />
                    <div role="group" aria-label="Where the clouds gather" className="flex flex-col px-3 pb-3 pt-1.5">
                      <p className="flex items-center gap-2.5 text-sm text-ink-muted">
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          aria-hidden
                        >
                          <circle cx="12" cy="12" r="7.5" />
                          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                        </svg>
                        Where
                      </p>
                      <div className="mt-auto grid w-fit grid-cols-3 gap-1 pl-[1.625rem] pt-2.5">
                        {CLOUD_PLACES.map((place) => {
                          const active = place.id === cloudPlace;
                          return (
                            <button
                              key={place.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={active}
                              aria-label={place.label}
                              title={place.label}
                              onClick={() => setCloudPlace(place.id)}
                              className={`size-3.5 rounded-[3px] border transition-colors ${
                                active ? "border-ink bg-ink" : "border-edge-strong hover:border-ink"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A 0 to 100 slider ("off" at 0): how visible a kind of line is, and the
    stars' brightness and amount. */
function PercentSlider({
  id,
  label,
  hint,
  value,
  onChange,
  icon,
}: {
  id: string;
  label: string;
  /** What it covers, under the label. */
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  icon: React.ReactNode;
}) {
  return (
    // A column: paired side by side, the two sliders line up at the bottom.
    <div role="group" aria-label={label} className="flex flex-col px-3 pb-3 pt-1.5">
      <label className="flex items-center gap-2.5 text-sm text-ink-muted" htmlFor={id}>
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          aria-hidden
        >
          {icon}
        </svg>
        <span className="flex-1 whitespace-nowrap">{label}</span>
        <span className="font-mono text-xs text-ink-faint">{value === 0 ? "off" : `${value}%`}</span>
      </label>
      {hint && <p className="mt-0.5 pl-[1.625rem] text-xs text-ink-faint">{hint}</p>}
      <div className="mt-auto pt-2.5">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-ink"
        />
      </div>
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
