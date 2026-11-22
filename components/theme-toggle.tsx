"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  setResizeHighlightHidden,
  setScrollbarsHidden,
  setStarsAmount,
  setStarsBrightness,
  setStarsOn,
  setTheme,
  setTooltipsHidden,
  useContrast,
  useLayoutLines,
  useContentLines,
  useCloudPlace,
  useCloudStyle,
  useCloudsAmount,
  useCodeCommentsHidden,
  useLearnShade,
  useResizeHighlightHidden,
  useScrollbarsHidden,
  useStarsAmount,
  useStarsBrightness,
  useStarsOn,
  useTheme,
  useTooltipsHidden,
  EXPLORER_FS_DEFAULT,
  explorerFontSize,
  setEditorRight,
  termContrast,
  termFontSize,
  termLineHeight,
  termVividness,
  useEditorRight,
  terminalColors,
  type TermColors,
  TERM_CONTRAST_DEFAULT,
  TERM_VIVID_DEFAULT,
  TERM_FS_DEFAULT,
  TERM_LH_DEFAULT,
  APP_FONTS,
  CODE_FONTS,
  appFont,
  codeFont,
  type AppFont,
  type CodeFont,
} from "@/lib/theme";
import { CODE_THEMES } from "@/components/code/code-theme";
import { SwitchTrack } from "@/components/ui/switch-track";
import {
  CodeBackgroundPicker,
  ExplorerBackgroundPicker,
  ExplorerHighlightPicker,
  SelectionColorPicker,
  TerminalBackgroundPicker,
} from "@/components/code/code-background";
import { POP, usePresence } from "@/lib/motion";

/**
 * Header theme picker. The trigger shows the CURRENT theme's icon (sun for
 * Light, moon for Dark, snowflake for Nord, …); clicking it drops a small menu
 * of every theme, each with its own glyph, plus a Normal / High / Super
 * contrast picker that deepens whichever theme is active, and a code
 * background for every editor, code block, and terminal, how visible lines
 * are, whether code examples show their comments, the shade along the bottom
 * of Learn, whether the app shows its tooltips, the highlight on draggable
 * borders, and its scrollbars, and the stars behind the app with their
 * brightness and amount and the clouds' version, cover, and place. Goes
 * through setTheme() so the `data-dark` flag and the editor's code theme stay
 * in sync. The icon starts as the Dark moon (the default) on first paint (SSR)
 * and corrects after hydration — same pattern as the rest of the theme
 * bootstrap, so there's no markup mismatch. `floating` is the button in full
 * screen, where the header is covered: round, its menu opening upward
 * (components/chrome/floating-nav.tsx places it at the bottom right).
 */
// Where you dragged the menu to, kept for the visit, so it opens there again.
const menuPlace = { x: 0, y: 0 };

// How far down you'd scrolled it, kept in this browser (reloads too), so it
// opens there again. Saved a moment after scrolling stops.
const MENU_SCROLL_KEY = "hu-theme-menu-scroll";
function readMenuScroll(): number {
  try {
    const n = Number(localStorage.getItem(MENU_SCROLL_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
let menuScrollTimer = 0;
function saveMenuScroll(top: number) {
  window.clearTimeout(menuScrollTimer);
  menuScrollTimer = window.setTimeout(() => {
    try {
      if (top > 0) localStorage.setItem(MENU_SCROLL_KEY, String(Math.round(top)));
      else localStorage.removeItem(MENU_SCROLL_KEY);
    } catch {
      /* ignore */
    }
  }, 150);
}

/** A shift (px) that keeps `rect`, moved by it from where it is now
    (`now`), inside the window, 8px from its edges where it fits. */
function inWindow(rect: DOMRect, now: { x: number; y: number }, next: { x: number; y: number }) {
  const dx = next.x - now.x;
  const dy = next.y - now.y;
  const left = Math.min(Math.max(rect.left + dx, 8), Math.max(8, window.innerWidth - 8 - rect.width));
  const top = Math.min(Math.max(rect.top + dy, 8), Math.max(8, window.innerHeight - 8 - rect.height));
  return { x: now.x + (left - rect.left), y: now.y + (top - rect.top) };
}

export function ThemeToggle({ floating = false }: { floating?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const contrast = useContrast();
  const lines = useLayoutLines();
  const contentLines = useContentLines();
  const commentsShown = !useCodeCommentsHidden();
  const shadeOn = useLearnShade();
  const scrollbarsHidden = useScrollbarsHidden();
  const tooltipsHidden = useTooltipsHidden();
  const resizeHighlightHidden = useResizeHighlightHidden();
  const starsOn = useStarsOn();
  const starsBrightness = useStarsBrightness();
  const starsAmount = useStarsAmount();
  const cloudStyle = useCloudStyle();
  const cloudPlace = useCloudPlace();
  const cloudCover = useCloudsAmount();
  const termFs = termFontSize.use();
  const termLh = termLineHeight.use();
  const termVivid = termVividness.use();
  const termK = termContrast.use();
  const bodyFont = appFont.use();
  const monoFont = codeFont.use();
  const explorerFs = explorerFontSize.use();
  const editorRight = useEditorRight();
  const termColors = terminalColors.use();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuShown = usePresence(open, menuRef, POP);
  const [offset, setOffset] = useState(() => ({ ...menuPlace }));
  const place = (next: { x: number; y: number }) => {
    menuPlace.x = next.x;
    menuPlace.y = next.y;
    setOffset(next);
  };

  // It closes from its button or a click outside it (drag it aside to see
  // a setting take effect, the terminal's say). Escape closes it too, but
  // only from inside it: typed anywhere else (vim in the terminal), the key
  // belongs there.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !menuRef.current?.contains(document.activeElement)) return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // It opens scrolled where you left it, before it paints, and moved
  // somewhere a smaller window no longer reaches: back inside it.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menuShown || !el) return;
    el.scrollTop = readMenuScroll();
    const fixed = inWindow(el.getBoundingClientRect(), offset, offset);
    if (fixed.x !== offset.x || fixed.y !== offset.y) place(fixed);
    // When it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuShown]);

  /** Drags the menu by its bar, or by any empty part of it (not a button,
      a switch, a swatch, a slider, a link, or a label), keeping it inside
      the window. */
  function startMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = menuRef.current;
    if (e.button !== 0 || !el) return;
    if ((e.target as Element).closest('button, input, select, textarea, a, label, [role="radio"], [role="slider"], [role="menuitemcheckbox"]')) return;
    // Its own scrollbar (when scrollbars show) scrolls it.
    if (e.target === el && e.nativeEvent.offsetX >= el.clientWidth) return;
    e.preventDefault();
    const bar = el;
    bar.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const from = { px: e.clientX, py: e.clientY, ...offset };
    const move = (ev: PointerEvent) => place(inWindow(rect, from, { x: from.x + ev.clientX - from.px, y: from.y + ev.clientY - from.py }));
    const up = () => {
      bar.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
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
                open ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised hover:text-ink"
              }`
        }
      >
        <ThemeIcon id={theme} className="size-5" />
      </button>

      {menuShown && (
        // Where it sits, moved by however far it's been dragged. The open
        // and close animations move the menu inside, so they never touch it.
        <div
          className={`absolute right-0 z-[60] ${floating ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.4rem)]"}`}
          style={{ translate: `${offset.x}px ${offset.y}px` }}
        >
          <div
            ref={menuRef}
            role="menu"
            aria-label="Theme"
            onPointerDown={startMove}
            onScroll={(e) => saveMenuScroll(e.currentTarget.scrollTop)}
            style={{ transformOrigin: floating ? "bottom right" : "top right" }}
            className={`slim-scroll w-[22rem] max-w-[calc(100vw-2rem)] sm:w-[40rem] overflow-y-auto rounded-card border border-edge bg-surface pb-1 shadow-(--shadow-card) ${
              floating
                ? "max-h-[calc(100dvh-5rem)] sm:max-h-[min(36rem,calc(100dvh-5rem))]"
                : "max-h-[calc(100dvh-4.5rem)] sm:max-h-[min(36rem,calc(100dvh-4.5rem))]"
            }`}
          >
            {/* The bar it's dragged by (its empty parts drag it too),
                staying flush at the top as it scrolls: the menu has no top
                padding, which a sticky bar would leave a gap under.
                Double-click puts it back. */}
            <div
              data-drag-handle
              onDoubleClick={() => place({ x: 0, y: 0 })}
              title="Drag to move it, double-click to put it back"
              className="sticky top-0 z-10 flex h-3.5 cursor-grab touch-none items-center justify-center rounded-t-card bg-surface active:cursor-grabbing"
            >
              <span aria-hidden className="h-1 w-8 rounded-full bg-edge-strong/60" />
            </div>
            {/* Two columns on wider screens: how things look on the left,
                lines and the sky on the right, and they fill the menu's
                height. The newer settings (the terminal, the fonts, the
                Explorer, and the compiler's sides) sit below them, a scroll
                away. On a phone it all stacks. */}
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
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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

                {/* Every tooltip in the app, kept from showing. */}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={tooltipsHidden}
                  onClick={() => setTooltipsHidden(!tooltipsHidden)}
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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
                    <rect x="3.5" y="4.5" width="17" height="11" rx="2" />
                    <path d="M10 15.5l2 3 2-3M7.5 10h9" />
                  </svg>
                  <span className="flex-1">
                    <span className="block">Hide tooltips</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">The hints that pop up on hover</span>
                  </span>
                  <SwitchTrack on={tooltipsHidden} className="mt-0.5" />
                </button>

                {/* Draggable borders, with only the cursor changing over them. */}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={resizeHighlightHidden}
                  onClick={() => setResizeHighlightHidden(!resizeHighlightHidden)}
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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
                    <path d="M12 4v16M8 9l-3 3 3 3M16 9l3 3-3 3" />
                  </svg>
                  <span className="flex-1">
                    <span className="block">Hide border highlight</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">Just the cursor over drag borders</span>
                  </span>
                  <SwitchTrack on={resizeHighlightHidden} className="mt-0.5" />
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

                {/* Every scrollbar in the app, gone, and everything still
                    scrolls. */}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={scrollbarsHidden}
                  onClick={() => setScrollbarsHidden(!scrollbarsHidden)}
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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
                    <path d="M16.5 8.5v3.5" strokeWidth={2.25} />
                  </svg>
                  <span className="flex-1">
                    <span className="block">Hide scrollbars</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">Everywhere, and it all still scrolls</span>
                  </span>
                  <SwitchTrack on={scrollbarsHidden} className="mt-0.5" />
                </button>

                {/* A starry sky behind the app, then how bright it is and how
                    many stars it has. */}
                <div role="separator" className="my-1 h-px bg-edge" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={starsOn}
                  onClick={() => setStarsOn(!starsOn)}
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
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
            <div className="border-t border-edge sm:grid sm:grid-cols-2 sm:divide-x sm:divide-edge">
              <div>
                {/* The terminal's own colors, background, and text size (every
                    terminal, the playground's too). */}
                <div className="flex items-center gap-2.5 px-3 pb-2 pt-2.5">
                  <label htmlFor="theme-term-colors" className="flex flex-1 items-center gap-2.5 whitespace-nowrap text-sm text-ink-muted">
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9l-.3-.7c-.5-1.1.3-2.4 1.5-2.4h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4.6-3.8-8.3-8.5-8.3z" />
                      <circle cx="7.8" cy="11" r="1.1" />
                      <circle cx="10.5" cy="7.3" r="1.1" />
                      <circle cx="15" cy="7.6" r="1.1" />
                    </svg>
                    Terminal colors
                  </label>
                  <select
                    id="theme-term-colors"
                    value={termColors}
                    onChange={(e) => terminalColors.set(e.target.value as TermColors)}
                    className="field w-36 shrink-0 rounded-btn px-2 py-1 text-xs font-medium text-ink"
                  >
                    <option value="vscode">VS Code</option>
                    <option value="editor">The editor&apos;s</option>
                    {CODE_THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <SizeSlider
                  id="theme-term-vivid"
                  label="Terminal vividness"
                  value={termVivid ?? TERM_VIVID_DEFAULT}
                  min={termVividness.min}
                  max={termVividness.max}
                  step={5}
                  format={(v) => `${v}%`}
                  icon={
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3.5c3 3.6 5.5 6.6 5.5 9.9a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6.3 5.5-9.9z" />
                      <path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" />
                    </svg>
                  }
                  onChange={(v) => termVividness.set(v === TERM_VIVID_DEFAULT ? null : v)}
                  note={null}
                  onReset={null}
                  resetLabel=""
                />
                <SizeSlider
                  id="theme-term-contrast"
                  label="Terminal contrast"
                  value={termK ?? TERM_CONTRAST_DEFAULT}
                  min={termContrast.min}
                  max={termContrast.max}
                  step={5}
                  format={(v) => (v <= 10 ? "Off" : `${v / 10}:1`)}
                  icon={
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
                    </svg>
                  }
                  onChange={(v) => termContrast.set(v === TERM_CONTRAST_DEFAULT ? null : v)}
                  note={null}
                  onReset={null}
                  resetLabel=""
                />
                <div role="group" aria-label="Terminal background" className="px-3 pb-2.5 pt-1.5">
                  <p className="flex items-center gap-2.5 text-sm text-ink-muted">
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
                      <path d="M7 9.5l3 2.5-3 2.5M12 15h5" />
                    </svg>
                    Terminal background
                  </p>
                  <div className="mt-2.5">
                    <TerminalBackgroundPicker compact />
                  </div>
                </div>
                <SizeSlider
                  id="theme-term-fs"
                  label="Terminal text"
                  value={termFs ?? TERM_FS_DEFAULT}
                  min={termFontSize.min}
                  max={termFontSize.max}
                  onChange={(px) => termFontSize.set(px === TERM_FS_DEFAULT ? null : px)}
                  note={null}
                  onReset={null}
                  resetLabel=""
                />
                <SizeSlider
                  id="theme-term-lh"
                  label="Terminal line spacing"
                  value={termLh ?? TERM_LH_DEFAULT}
                  min={termLineHeight.min}
                  max={termLineHeight.max}
                  step={5}
                  format={(v) => (v / 100).toFixed(2)}
                  icon={
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 6.5h10M10 12h10M10 17.5h10M5 4.5v15M3 7l2-2.5L7 7M3 17l2 2.5L7 17" />
                    </svg>
                  }
                  onChange={(v) => termLineHeight.set(v === TERM_LH_DEFAULT ? null : v)}
                  note={null}
                  onReset={null}
                  resetLabel=""
                />

              </div>
              <div>
                {/* The app's fonts: its text, and code (editors, code
                    blocks, the terminal). */}
                <FontSelect
                  id="theme-font-body"
                  label="App font"
                  icon={<path d="M5 19 10.5 5h1L17 19M7.4 13.5h7.2" />}
                  value={bodyFont}
                  options={APP_FONTS}
                  onChange={(id) => setFont(() => appFont.set(id as AppFont))}
                />
                <FontSelect
                  id="theme-font-code"
                  label="Code font"
                  icon={<path d="M8.5 7 4 12l4.5 5M15.5 7l4.5 5-4.5 5" />}
                  value={monoFont}
                  options={CODE_FONTS}
                  onChange={(id) => setFont(() => codeFont.set(id as CodeFont))}
                />
                <div role="separator" className="my-1 h-px bg-edge" />
                {/* The Explorer's (the compiler's and the playground's). */}
                <div role="group" aria-label="Explorer background" className="px-3 pb-2.5 pt-1.5">
                  <p className="flex items-center gap-2.5 text-sm text-ink-muted">
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.5l2 2h7.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
                    </svg>
                    Explorer background
                  </p>
                  <div className="mt-2.5">
                    <ExplorerBackgroundPicker compact />
                  </div>
                </div>
                {/* Its open file's row. */}
                <div role="group" aria-label="Explorer highlight" className="px-3 pb-2.5 pt-1.5">
                  <p className="flex items-center gap-2.5 text-sm text-ink-muted">
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="9" width="18" height="6" rx="1.5" />
                      <path d="M6 5.5h8M6 18.5h10" />
                    </svg>
                    Explorer highlight
                  </p>
                  <div className="mt-2.5">
                    <ExplorerHighlightPicker compact />
                  </div>
                </div>
                <SizeSlider
                  id="theme-explorer-fs"
                  label="Explorer text"
                  value={explorerFs ?? EXPLORER_FS_DEFAULT}
                  min={explorerFontSize.min}
                  max={explorerFontSize.max}
                  onChange={(px) => explorerFontSize.set(px === EXPLORER_FS_DEFAULT ? null : px)}
                  note={null}
                  onReset={null}
                  resetLabel=""
                />

                {/* The compiler's sides: the editor on the left or the right. */}
                <div role="separator" className="my-1 h-px bg-edge" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={editorRight}
                  onClick={() => setEditorRight(!editorRight)}
                  className="flex w-full items-start gap-2.5 px-3 pb-2.5 pt-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
                    <path d="M13 4.5v15" />
                    <path d="M15.5 9h3M15.5 12h3M15.5 15h2" />
                  </svg>
                  <span className="flex-1">
                    <span className="block">Editor on the right</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">On the compiler, with the output and panel on the left</span>
                  </span>
                  <SwitchTrack on={editorRight} className="mt-0.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Switches a font, then has every editor measure again: CodeMirror keeps
    the widths of the font it measured until something resizes it. */
function setFont(apply: () => void) {
  apply();
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  void document.fonts?.ready.then(() => window.dispatchEvent(new Event("resize")));
}

/** A font picker: its label, and a dropdown of the fonts. */
function FontSelect({
  id,
  label,
  icon,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 pb-2 pt-2.5">
      <label htmlFor={id} className="flex flex-1 items-center gap-2.5 whitespace-nowrap text-sm text-ink-muted">
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {icon}
        </svg>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field w-40 shrink-0 rounded-btn px-2 py-1 text-xs font-medium text-ink">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A text size in px, with what it is now beside the label (or another
    number, with its own `format`, `step`, and `icon`). */
function SizeSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => `${v}px`,
  icon,
  onChange,
  note,
  onReset,
  resetLabel,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  icon?: React.ReactNode;
  onChange: (px: number) => void;
  /** What the size is when it isn't set (the editor's), under the label. */
  note: string | null;
  /** Back to the default, when one's set. */
  onReset: (() => void) | null;
  resetLabel: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col px-3 pb-3 pt-1.5">
      <label className="flex items-center gap-2.5 text-sm text-ink-muted" htmlFor={id}>
        {icon ?? (
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
            <path d="M4 18 8.5 6 13 18M5.6 14h5.8M15 18l3-8 3 8M15.9 15.5h4.2" />
          </svg>
        )}
        <span className="flex-1 whitespace-nowrap">{label}</span>
        <span className="font-mono text-xs text-ink-faint">{format(value)}</span>
      </label>
      {(note || onReset) && (
        <p className="mt-0.5 pl-[1.625rem] text-xs text-ink-faint">
          {note}
          {onReset && (
            <button type="button" onClick={onReset} className="rounded-btn underline decoration-edge-strong underline-offset-2 hover:text-ink">
              {resetLabel}
            </button>
          )}
        </p>
      )}
      <div className="mt-auto pt-2.5">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
      </div>
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
