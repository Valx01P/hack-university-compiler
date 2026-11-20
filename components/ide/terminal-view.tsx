"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { useIdeSettings } from "@/lib/ide-settings";
import { attachTerminal, type TerminalSession } from "@/lib/terminal-bridge";
import type { WorkspaceStore } from "@/lib/workspace-store";
import { scaleChroma, withContrast } from "@/lib/oklch";
import { evenCells, terminalFamily } from "@/lib/terminal-font";
import { APP_TERM_CONTRAST } from "@/lib/theme";

/**
 * One terminal (architecture §8.3), xterm.js 6 loaded only when a terminal
 * opens, with the fit, web-links, and serialize addons, joined to a runner
 * session by lib/terminal-bridge.ts.
 *
 * - Colors come from the code theme's CSS variables (the 16 --ansi-* tokens,
 *   the code background and text, the selection, the scrollbar), or another
 *   code theme's when the theme menu picks Terminal colors (.term-colors,
 *   globals.css), re-read whenever the theme, contrast, background,
 *   selection, or those change. Contrast raises dim
 *   colors as the terminal draws (1, 4.5:1, 7:1 for Normal, High, Super).
 * - The theme menu's vividness scales the 16 colors' chroma, and its
 *   contrast (the app's level's until set) raises the chromatic ones by
 *   lightness alone (lib/oklch.ts), so they keep their strength, xterm's own
 *   minimum contrast handling what's left (other text, a program's own RGB).
 * - The font is the code font (the theme menu's, JetBrains Mono to begin
 *   with), as lib/terminal-font.ts names it for tight rows, loaded before
 *   the terminal opens (xterm measures its cells then), at the theme menu's
 *   size (12px unset), its rows the menu's line spacing (1.1 unset), drawn
 *   with WebGL so block characters fill their cells.
 * - The screen is kept in sessionStorage as it changes (serialize), so a
 *   reload paints it at once while the session reattaches, and the runner's
 *   replay then puts the real one back.
 * - Links: localhost:<port> opens the preview, other addresses a new tab
 *   (noopener), and file:line:col in a stack trace opens the editor there.
 * - Escape belongs to the program (vim, less). Ctrl+Backquote goes back to
 *   the editor. No app shortcut fires while a terminal has focus.
 */

/** The code font (the theme menu's, globals.css --font-code). */
const codeFont = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--font-code").trim() || '"JetBrains Mono Variable", ui-monospace, monospace';
const ANSI = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;
// The colors with a hue (red to cyan, plain and bright): raised to the
// contrast here. Black, white, and the grays are left to xterm, which judges
// each against what it's drawn on (black as a background stays black).
const CHROMATIC = new Set([1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]);

/** A number the theme menu keeps on <html> (lib/theme.ts), or `fallback`. */
function htmlNumber(name: string, fallback: number): number {
  const n = Number.parseFloat(document.documentElement.style.getPropertyValue(name));
  return Number.isFinite(n) ? n : fallback;
}
/** The contrast the terminal's colors keep: its own, else the app level's. */
const contrastRatio = () =>
  htmlNumber("--term-contrast", (APP_TERM_CONTRAST[document.documentElement.getAttribute("data-contrast") ?? "normal"] ?? 10) / 10);
/** The row height, in multiples of the text size (theme menu, 1.1 unset). */
const lineSpacing = () => Math.min(1.8, Math.max(1, htmlNumber("--term-lh", 1.1)));
/** xterm's lineHeight and letterSpacing for that spacing, with `family`, at
    the screen's pixel ratio now: cells an even number of its pixels across
    and down (lib/terminal-font.ts), so half blocks and quadrants meet. */
const cellsFor = (family: string) => evenCells(family, fontSize(), lineSpacing());

/** A CSS color (a variable that may hold color-mix()) as #rrggbb. */
function resolveColor(probe: HTMLElement, value: string, fallback: string): string {
  probe.style.color = "";
  probe.style.color = value;
  const rgb = getComputedStyle(probe).color;
  const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(rgb);
  if (!m) return fallback;
  return `#${[m[1], m[2], m[3]].map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
}

let canvas: CanvasRenderingContext2D | null | undefined;

/** Like resolveColor, for opaque colors that compute to something other than
    rgb(), like color-mix() in oklab (a picked code background's scrollbar):
    a 1px canvas turns those back into sRGB. */
function solidColor(probe: HTMLElement, value: string, fallback: string): string {
  probe.style.color = "";
  probe.style.color = value;
  const css = getComputedStyle(probe).color;
  if (/^rgba?\(/.test(css)) return resolveColor(probe, value, fallback);
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!canvas) return fallback;
  canvas.fillStyle = "#010203";
  canvas.fillStyle = css;
  if (canvas.fillStyle === "#010203") return fallback;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
  if (!a) return fallback;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function themeFrom(host: HTMLElement) {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const v = (name: string, fallback: string) => resolveColor(probe, `var(${name}, ${fallback})`, fallback);
  // The scrollbar is the code surface's own thumb (app/globals.css), a little
  // stronger under the pointer and while it's dragged.
  const thumb = (inkPercent: number) =>
    solidColor(
      probe,
      inkPercent ? `color-mix(in oklab, var(--scrollbar, #4d4d4d) ${100 - inkPercent}%, var(--code-ink, #f0ece6))` : "var(--scrollbar, #4d4d4d)",
      "#4d4d4d"
    );
  // The terminal's own background from the theme menu (lib/theme.ts): a
  // color, or (nothing set) the code background, which is see-through like
  // the rest of the app with the stars on. See-through is transparent black
  // (what shows through is the dark sky), and the cursor and the contrast
  // keep the solid color.
  const own = document.documentElement.hasAttribute("data-term-bg");
  const solid = own ? v("--term-bg", v("--code-bg", "#0a0a0a")) : v("--code-bg", "#0a0a0a");
  const clear = !own && document.documentElement.hasAttribute("data-stars");
  const background = clear ? "#00000000" : solid;
  const foreground = v("--code-ink", "#f0ece6");
  const theme: Record<string, string> = {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: solid,
    selectionBackground: v("--code-selection", "#555555"),
    scrollbarSliderBackground: thumb(0),
    scrollbarSliderHoverBackground: thumb(20),
    scrollbarSliderActiveBackground: thumb(35),
  };
  const vivid = htmlNumber("--term-vivid", 1);
  const ratio = contrastRatio();
  ANSI.forEach((name, i) => {
    let color = v(`--ansi-${i}`, "#888888");
    if (vivid !== 1) color = scaleChroma(color, vivid);
    if (CHROMATIC.has(i)) color = withContrast(color, solid, ratio);
    theme[name] = color;
  });
  probe.remove();
  return theme;
}

/**
 * xterm's WebGL addon (0.19) draws a cell's own background whenever the
 * cell's background value isn't zero, and a dim or italic cell's carries
 * those flags, so it gets one: the default background, at full alpha even
 * when that's see-through, a box behind a prompt's faint text. Patched once,
 * on its rectangle renderer's prototype: a default background that isn't
 * inverted draws clear (blending is on, so nothing shows), leaving the
 * terminal's own background behind it. If the addon's insides differ (a
 * newer version), this does nothing.
 */
const INVERSE = 0x4000000;
const COLOR_MODE = 0x3000000;
function clearDefaultBackgrounds(webgl: object) {
  type Vertices = { attributes: Float32Array };
  type Draw = (vertices: Vertices, offset: number, fg: number, bg: number, ...rest: number[]) => void;
  const rects = (webgl as { _renderer?: { _rectangleRenderer?: { value?: object } } })._renderer?._rectangleRenderer?.value;
  const proto = rects ? (Object.getPrototypeOf(rects) as { _updateRectangle?: Draw; huClearDefault?: boolean }) : null;
  const draw = proto?._updateRectangle;
  if (!proto || typeof draw !== "function" || draw.length !== 7 || proto.huClearDefault) return;
  proto._updateRectangle = function (this: unknown, vertices, offset, fg, bg, ...rest) {
    draw.call(this, vertices, offset, fg, bg, ...rest);
    // Its color's alpha, the last of the rectangle's eight numbers.
    if (!(fg & INVERSE) && (bg & COLOR_MODE) === 0) vertices.attributes[offset + 7] = 0;
  };
  proto.huClearDefault = true;
}

/** The room the terminal keeps on its right for its scrollbar: none to
    speak of while the theme menu hides scrollbars (xterm's 14px default
    otherwise), so lines wrap at the edge you see. The fit reads it too. */
const scrollbarRoom = () => (document.documentElement.getAttribute("data-scrollbars") === "hidden" ? { width: 1 } : {});

/** The terminal's text size from the theme menu, 12px unset (VS Code's). */
const fontSize = () => Math.min(22, Math.max(11, htmlNumber("--term-fs", 12)));

const cacheKey = (sid: string) => `hu-term-screen:${sid}`;

export interface TerminalHandle {
  session: TerminalSession | null;
  term: Terminal | null;
  focus(): void;
}

export function TerminalView({
  store,
  sid,
  label,
  readOnly = false,
  visible,
  onExit,
  handleRef,
}: {
  store: WorkspaceStore;
  sid: string;
  label: string;
  readOnly?: boolean;
  /** Hidden terminals stay mounted, keeping their screens. */
  visible: boolean;
  onExit?: (exit: { code: number | null; signal: string | null }) => void;
  handleRef?: (handle: TerminalHandle | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<{ fit(): void } | null>(null);
  const settings = useIdeSettings();
  const [ended, setEnded] = useState<string | null>(null);
  // Another tab is the writer: this one watches until it takes over.
  const [watching, setWatching] = useState(false);
  const sessionRef = useRef<TerminalSession | null>(null);
  const live = useRef({ onExit, settings });
  live.current = { onExit, settings };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let session: TerminalSession | null = null;
    let term: Terminal | null = null;
    const cleanups: (() => void)[] = [];

    void (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { SerializeAddon }, { WebglAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
        import("@xterm/addon-serialize"),
        import("@xterm/addon-webgl"),
      ]);
      // xterm measures its cells when it opens: the font must be there.
      let font = codeFont();
      let family = await terminalFamily(font);
      await document.fonts?.load(`13px ${family}`).catch(() => {});
      if (disposed) return;
      term = new Terminal({
        fontFamily: family,
        fontSize: fontSize(),
        // The theme menu's line spacing, in cells of even sizes.
        ...cellsFor(family),
        scrollback: 5000,
        cursorBlink: !readOnly,
        disableStdin: readOnly,
        macOptionIsMeta: live.current.settings.optionIsMeta,
        screenReaderMode: live.current.settings.screenReader,
        minimumContrastRatio: contrastRatio(),
        theme: themeFrom(host),
        overviewRuler: scrollbarRoom(),
        allowTransparency: true,
        allowProposedApi: false,
      });
      termRef.current = term;
      const fit = new FitAddon();
      const serialize = new SerializeAddon();
      term.loadAddon(fit);
      term.loadAddon(serialize);
      term.loadAddon(
        new WebLinksAddon((event, uri) => {
          event.preventDefault();
          try {
            const url = new URL(uri);
            const port = Number(url.port);
            if (["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname) && store.ports.has(port)) {
              store.openPreview(port, `${url.pathname}${url.search}`);
              return;
            }
            if (url.protocol === "http:" || url.protocol === "https:") window.open(uri, "_blank", "noopener,noreferrer");
          } catch {
            /* not a URL */
          }
        })
      );
      // file:line:col in stack traces (Node, Python, Go, Java) opens the editor.
      term.registerLinkProvider({
        provideLinks(y, callback) {
          const line = term!.buffer.active.getLine(y - 1)?.translateToString(true) ?? "";
          const re = /(?:\/workspace\/)?((?:[\w.-]+\/)*[\w.-]+\.[a-z]{1,5})[:(](\d+)(?:[:,](\d+))?/g;
          const links = [];
          for (let m = re.exec(line); m; m = re.exec(line)) {
            const path = m[1];
            if (!store.nodes.has(path)) continue;
            const at = Number(m[2]);
            links.push({
              text: m[0],
              range: { start: { x: m.index + 1, y }, end: { x: m.index + m[0].length, y } },
              activate: () => store.openFile(path, { line: at }),
            });
          }
          callback(links);
        },
      });
      term.attachCustomKeyEventHandler((e) => {
        // Ctrl+Backquote leaves for the editor. Everything else is the program's.
        if (e.type === "keydown" && e.ctrlKey && e.code === "Backquote") return false;
        return true;
      });
      term.open(host);
      // Drawn with WebGL, as VS Code's terminal is: block and box characters
      // drawn to fill their cells exactly (a TUI's logo, its borders), not
      // taken from a fallback font, which leaves hairlines between rows and
      // runs wide. Without WebGL (or its context lost), xterm's own DOM
      // renderer draws instead.
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
        clearDefaultBackgrounds(webgl);
        // It sizes its canvas by the screen's own pixels and lays out by
        // devicePixelRatio. A browser whose two disagree (emulated scaling)
        // gets a blank terminal, so there it's the DOM renderer.
        const check = window.setTimeout(() => {
          const canvas = host.querySelector<HTMLCanvasElement>(".xterm-screen canvas:not(.xterm-link-layer)");
          if (canvas && canvas.clientWidth > 0 && Math.abs(canvas.width - canvas.clientWidth * window.devicePixelRatio) > 2) webgl.dispose();
        }, 600);
        cleanups.push(() => window.clearTimeout(check));
      } catch {
        /* no WebGL here */
      }
      fitRef.current = fit;
      // The screen from before a reload, at once, until the replay lands.
      try {
        const cached = sessionStorage.getItem(cacheKey(sid));
        if (cached) term.write(cached);
      } catch {
        /* storage blocked */
      }
      if (host.offsetWidth > 0) fit.fit();
      session = attachTerminal(term, {
        workspace: store.id,
        sid,
        readOnly,
        onExit: (exit) => {
          live.current.onExit?.(exit);
          if (!readOnly) setEnded(`The shell exited${exit.code !== null ? ` (${exit.code})` : ""}.`);
        },
        onMode: (ro) => setWatching(ro),
        onGone: (reason) => {
          setEnded(reason);
          try {
            sessionStorage.removeItem(cacheKey(sid));
          } catch {
            /* storage blocked */
          }
          if (!readOnly) store.terminalGone(sid);
        },
      });
      sessionRef.current = session;
      const resize = term.onResize(({ cols, rows }) => session?.resize(cols, rows));
      // The screen, saved a moment after it changes.
      let saveTimer = 0;
      const write = term.onWriteParsed(() => {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          try {
            sessionStorage.setItem(cacheKey(sid), serialize.serialize({ scrollback: 1000 }));
          } catch {
            /* full or blocked */
          }
        }, 500);
      });
      cleanups.push(() => {
        window.clearTimeout(saveTimer);
        resize.dispose();
        write.dispose();
      });
      handleRef?.({ session, term, focus: () => term?.focus() });

      // Re-theme when the code theme, contrast, background, selection, the
      // terminal's own colors, line spacing, or the stars change.
      /** The cells' size again (the text size, spacing, font, or the
          screen's pixel ratio changed). */
      const recell = () => {
        if (!term) return;
        const { lineHeight, letterSpacing } = cellsFor(family);
        if (term.options.lineHeight !== lineHeight) term.options.lineHeight = lineHeight;
        if (term.options.letterSpacing !== letterSpacing) term.options.letterSpacing = letterSpacing;
      };
      // The pixel ratio changes with the browser's zoom, or a move to
      // another screen.
      let ratio: MediaQueryList | null = null;
      const onRatio = () => {
        recell();
        if (host.offsetWidth > 0) fit.fit();
        watchRatio();
      };
      const watchRatio = () => {
        ratio?.removeEventListener("change", onRatio);
        ratio = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        ratio.addEventListener("change", onRatio);
      };
      watchRatio();
      cleanups.push(() => ratio?.removeEventListener("change", onRatio));
      const observer = new MutationObserver(() => {
        if (!term) return;
        term.options.theme = themeFrom(host);
        term.options.minimumContrastRatio = contrastRatio();
        term.options.fontSize = fontSize();
        recell();
        term.options.overviewRuler = scrollbarRoom();
        if (host.offsetWidth > 0) fit.fit();
        // Another code font: the terminal's own of it, once it's loaded.
        const next = codeFont();
        if (next === font) return;
        font = next;
        void terminalFamily(next).then(async (made) => {
          await document.fonts?.load(`13px ${made}`).catch(() => {});
          if (!term || font !== next) return;
          family = made;
          term.options.fontFamily = made;
          recell();
          if (host.offsetWidth > 0) fit.fit();
        });
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-code-theme", "data-contrast", "data-code-bg", "data-code-sel", "data-stars", "data-term-bg", "data-term-colors", "data-font-code", "data-scrollbars", "style"],
      });
      const sized = new ResizeObserver(() => {
        if (host.offsetWidth > 0 && host.offsetHeight > 0) requestAnimationFrame(() => fit.fit());
      });
      sized.observe(host);
      cleanups.push(() => {
        observer.disconnect();
        sized.disconnect();
      });
    })();

    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      session?.dispose();
      term?.dispose();
      termRef.current = null;
      handleRef?.(null);
    };
    // A terminal lives as long as its session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, readOnly, store]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.macOptionIsMeta = settings.optionIsMeta;
    term.options.screenReaderMode = settings.screenReader;
  }, [settings.optionIsMeta, settings.screenReader]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fitRef.current?.fit());
  }, [visible]);

  return (
    <div className={`code-dark term-surface term-colors relative h-full min-h-0 ${visible ? "" : "hidden"}`} role="region" aria-label={label}>
      {/* The padding sits outside the element the terminal measures, so its
          columns fit what's left (Tailwind's boxes count padding in their
          width). Its top puts the first row's text level with an editor's
          first line beside it (the compiler's panel), at any line spacing
          (.term-pad, globals.css). */}
      <div className="term-pad h-full min-h-0 px-3 pb-2">
        <div ref={hostRef} data-terminal className="h-full min-h-0" />
      </div>
      {watching && !ended && (
        <p className="absolute inset-x-0 top-0 flex items-center gap-2 bg-code-bg/95 px-3 py-1 font-mono text-xs text-code-gutter" role="status">
          Another tab is typing in this terminal, so this one only watches.
          <button
            type="button"
            onClick={() => sessionRef.current?.takeOver()}
            className="rounded-btn border border-code-content-line px-2 py-0.5 text-code-ink hover:bg-code-edge"
          >
            Take over
          </button>
        </p>
      )}
      {ended && (
        <p className="absolute inset-x-0 bottom-0 bg-code-bg px-3 py-1 font-mono text-xs text-code-gutter" role="status">
          {ended}
        </p>
      )}
    </div>
  );
}
