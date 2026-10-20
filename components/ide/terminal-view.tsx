"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { useIdeSettings } from "@/lib/ide-settings";
import { attachTerminal, type TerminalSession } from "@/lib/terminal-bridge";
import type { WorkspaceStore } from "@/lib/workspace-store";

/**
 * One terminal (architecture §8.3), xterm.js 6 loaded only when a terminal
 * opens, with the fit, web-links, and serialize addons, joined to a runner
 * session by lib/terminal-bridge.ts.
 *
 * - Colors come from the code theme's CSS variables (the 16 --ansi-* tokens,
 *   the code background and text, the selection), re-read whenever the
 *   theme, contrast, background, or selection changes. Contrast raises dim
 *   colors as the terminal draws (1, 4.5:1, 7:1 for Normal, High, Super).
 * - The font is the bundled JetBrains Mono, loaded before the terminal opens
 *   (xterm measures its cells then), at the editor's zoom.
 * - The screen is kept in sessionStorage as it changes (serialize), so a
 *   reload paints it at once while the session reattaches, and the runner's
 *   replay then puts the real one back.
 * - Links: localhost:<port> opens the preview, other addresses a new tab
 *   (noopener), and file:line:col in a stack trace opens the editor there.
 * - Escape belongs to the program (vim, less). Ctrl+Backquote goes back to
 *   the editor. No app shortcut fires while a terminal has focus.
 */

const FONT = '"JetBrains Mono Variable", ui-monospace, monospace';
const ANSI = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;
const CONTRAST: Record<string, number> = { high: 4.5, super: 7 };

/** A CSS color (a variable that may hold color-mix()) as #rrggbb. */
function resolveColor(probe: HTMLElement, value: string, fallback: string): string {
  probe.style.color = "";
  probe.style.color = value;
  const rgb = getComputedStyle(probe).color;
  const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(rgb);
  if (!m) return fallback;
  return `#${[m[1], m[2], m[3]].map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
}

function themeFrom(host: HTMLElement) {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const v = (name: string, fallback: string) => resolveColor(probe, `var(${name}, ${fallback})`, fallback);
  const solid = v("--code-bg", "#0a0a0a");
  // With the stars on (lib/theme.ts) the terminal is see-through like the rest
  // of the app. Its own color stays in the rgb, for the contrast checks, and
  // the cursor keeps it solid.
  const background = document.documentElement.hasAttribute("data-stars") ? `${solid}00` : solid;
  const foreground = v("--code-ink", "#f0ece6");
  const theme: Record<string, string> = {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: solid,
    selectionBackground: v("--code-selection", "#555555"),
    scrollbarSliderBackground: v("--code-edge", "#333333"),
  };
  ANSI.forEach((name, i) => (theme[name] = v(`--ansi-${i}`, "#888888")));
  probe.remove();
  return theme;
}

const fontSize = () => {
  const px = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--code-user-fs"));
  return Number.isFinite(px) ? Math.min(22, Math.max(11, px)) : 13;
};

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
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { SerializeAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
        import("@xterm/addon-serialize"),
      ]);
      // xterm measures its cells when it opens: the font must be there.
      await document.fonts?.load(`13px ${FONT}`).catch(() => {});
      if (disposed) return;
      const contrast = document.documentElement.getAttribute("data-contrast") ?? "";
      term = new Terminal({
        fontFamily: FONT,
        fontSize: fontSize(),
        lineHeight: 1.2,
        scrollback: 5000,
        cursorBlink: !readOnly,
        disableStdin: readOnly,
        macOptionIsMeta: live.current.settings.optionIsMeta,
        screenReaderMode: live.current.settings.screenReader,
        minimumContrastRatio: CONTRAST[contrast] ?? 1,
        theme: themeFrom(host),
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

      // Re-theme when the code theme, contrast, background, selection, or the
      // stars change.
      const observer = new MutationObserver(() => {
        if (!term) return;
        term.options.theme = themeFrom(host);
        term.options.minimumContrastRatio = CONTRAST[document.documentElement.getAttribute("data-contrast") ?? ""] ?? 1;
        term.options.fontSize = fontSize();
        if (host.offsetWidth > 0) fit.fit();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-code-theme", "data-contrast", "data-code-bg", "data-code-sel", "data-stars", "style"] });
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
    <div className={`code-dark relative h-full min-h-0 bg-code-bg ${visible ? "" : "hidden"}`} role="region" aria-label={label}>
      <div ref={hostRef} data-terminal className="h-full min-h-0 py-1 pl-2" />
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
