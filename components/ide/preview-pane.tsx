"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, X } from "lucide-react";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The preview (architecture §8.3): a workspace server in a frame, at
 * http://<this page's host name>:<port><path>. The same host name keeps it
 * the same site as the app, so cookies and storage act first-party as in a
 * real tab, while the other port makes it another origin, which can never
 * reach the app's own storage. The frame never gets allow-top-navigation.
 * Its own address bar has back, forward, and reload; widths Responsive, 375,
 * 768, and 1280; Reload without JavaScript, which shows only what the
 * server rendered; and Open in new tab, which always works. A server that
 * refuses frames (helmet, Spring Security) gets a message naming the
 * header, never a stripped header. Until its first load the frame is a
 * same-size box in the code background, swapped without animation.
 */

const WIDTHS = [
  { id: "fit", label: "Responsive" },
  { id: "375", label: "375" },
  { id: "768", label: "768" },
  { id: "1280", label: "1280" },
];
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads";
// Ports whose old site data this page load already cleared.
const clearedPorts = new Set<number>();

export function PreviewPane({ store }: { store: WorkspaceStore }) {
  useStore(store, "preview", "ports");
  const { port, path, nonce } = store.preview;
  const [history, setHistory] = useState<{ list: string[]; at: number }>({ list: [path], at: 0 });
  const [address, setAddress] = useState(path);
  const [width, setWidth] = useState("fit");
  const [noJs, setNoJs] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lastNonce = useRef(nonce);
  const info = port !== null ? store.ports.get(port) : undefined;
  const current = history.list[history.at] ?? "/";
  const host = typeof window === "undefined" ? "localhost" : window.location.hostname;
  // A port another lesson used before gets its site data cleared once, by
  // the runner's /__hu/clear-site-data (which then sends the frame to /).
  const clearFirst = Boolean(info?.clearSiteData) && port !== null && !clearedPorts.has(port);
  const src = port !== null ? `http://${host}:${port}${clearFirst ? "/__hu/clear-site-data" : current}` : "about:blank";

  // A new path from outside (a link in the terminal, the Ports panel).
  useEffect(() => {
    if (lastNonce.current === nonce) return;
    lastNonce.current = nonce;
    setHistory((h) => (h.list[h.at] === path ? h : { list: [...h.list.slice(0, h.at + 1), path], at: h.at + 1 }));
    setAddress(path);
  }, [nonce, path]);

  const go = (to: string) => {
    const p = to.startsWith("/") ? to : `/${to}`;
    setHistory((h) => ({ list: [...h.list.slice(0, h.at + 1), p], at: h.at + 1 }));
    setAddress(p);
    setLoaded(false);
  };
  const btn = "inline-flex size-6 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:opacity-40";
  const listening = info?.state === "listening";
  const refused = info?.framable === false;

  return (
    <section aria-label="Preview" className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-1.5">
        <h2 className="px-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint dark:text-gold">Preview</h2>
        <button type="button" className={btn} aria-label="Back" disabled={history.at === 0} onClick={() => setHistory((h) => ({ ...h, at: h.at - 1 }))}>
          <ArrowLeft className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={btn} aria-label="Forward" disabled={history.at >= history.list.length - 1} onClick={() => setHistory((h) => ({ ...h, at: h.at + 1 }))}>
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={btn} aria-label="Reload" onClick={() => store.reloadPreview()}>
          <RotateCw className="size-3.5" aria-hidden />
        </button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(address);
          }}
        >
          <label className="sr-only" htmlFor={`${store.id}-preview-address`}>
            Preview address
          </label>
          <div className="field flex items-center rounded-btn px-1.5 py-0.5 font-mono text-xs">
            <span className="shrink-0 text-ink-faint">:{port}</span>
            <input
              id={`${store.id}-preview-address`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              className="min-w-0 flex-1 border-0 bg-transparent px-1 text-base text-ink outline-none sm:text-xs"
            />
          </div>
        </form>
        <select aria-label="Preview width" value={width} onChange={(e) => setWidth(e.target.value)} className="field rounded-btn py-0.5 pl-1.5 text-xs sm:text-xs">
          {WIDTHS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={noJs}
          onClick={() => {
            setNoJs((v) => !v);
            setLoaded(false);
          }}
          title="Reload without JavaScript: only what the server rendered"
          className={`rounded-btn px-1.5 py-0.5 text-xs font-medium transition-colors ${noJs ? "bg-raised text-ink" : "text-ink-faint hover:text-ink"}`}
        >
          No JS
        </button>
        <a href={src} target="_blank" rel="noopener noreferrer" className={btn} aria-label="Open in new tab" title="Open in new tab">
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <button type="button" className={btn} aria-label="Close the preview" onClick={() => store.closePreview()}>
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="code-dark relative min-h-0 flex-1 overflow-auto bg-code-bg">
        {!listening ? (
          <p className="p-4 text-sm text-code-gutter">Nothing is listening on port {port} in this workspace yet. Press Run, or start the server in the terminal.</p>
        ) : refused ? (
          <div className="p-4 text-sm text-code-ink">
            <p>This page refuses to show inside another page{info?.reason ? `: it sends ${info.reason}` : ""}.</p>
            <p className="mt-1 text-code-gutter">That&apos;s the server protecting itself, as it should. Open it in a new tab instead.</p>
            <a href={src} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-btn border border-code-content-line px-3 py-1.5 text-xs hover:bg-code-edge">
              Open in new tab
            </a>
          </div>
        ) : (
          <iframe
            key={`${src}#${nonce}#${noJs}`}
            src={src}
            title={`Preview of port ${port}`}
            sandbox={noJs ? SANDBOX.replace("allow-scripts ", "") : SANDBOX}
            referrerPolicy="no-referrer"
            onLoad={() => {
              if (clearFirst && port !== null) clearedPorts.add(port);
              setLoaded(true);
            }}
            style={{ width: width === "fit" ? "100%" : `${width}px` }}
            className={`mx-auto block h-full border-0 bg-white ${loaded ? "" : "invisible"}`}
          />
        )}
      </div>
    </section>
  );
}
