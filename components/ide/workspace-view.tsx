"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { CodeThemePicker } from "@/components/code/code-theme";
import { Dock } from "@/components/ide/dock";
import { EditorGroup, EditorTabs } from "@/components/ide/editor-group";
import { Explorer } from "@/components/ide/explorer";
import { PreviewPane } from "@/components/ide/preview-pane";
import { QuickOpen } from "@/components/ide/quick-open";
import { ResetMenu } from "@/components/ide/reset-menu";
import { checkSummary } from "@/components/ide/results-panel";
import { StatusPill } from "@/components/ide/status-pill";
import type { TerminalHandle } from "@/components/ide/terminal-view";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { SwitchTrack } from "@/components/ui/switch-track";
import { useFullScreen } from "@/lib/full-screen";
import { setIdeSetting, useIdeSettings } from "@/lib/ide-settings";
import { revealWorkspace, urlParam, writeUrl } from "@/lib/url-state";
import { useStore, WorkspaceStore, type DockPanel } from "@/lib/workspace-store";
import type { WorkspaceProps } from "@/lib/workspace-types";

/**
 * The IDE (architecture §8.1, §8.2): the explorer, the editor with its tabs,
 * the dock with terminals and panels, and the preview, around one workspace.
 * Pane sizes are CSS variables, set in the server markup and kept for the
 * session (never saved, so a reload never shifts). The explorer tree, the
 * tabs, and the toolbar paint first from the template's starting tree (built
 * at build time), and a restoring load keeps the region hidden until the
 * live tree, the open file, and your tabs are in, then shows it whole, with
 * 1.5 seconds at most. When the runner isn't running it shows at once, with
 * the starting tree and a banner.
 *
 * Keys (never while a terminal has focus, so Ctrl+C, Ctrl+Z, Ctrl+R, Ctrl+D,
 * and Ctrl+L reach the shell): Run Mod+Enter, Check Mod+Shift+Enter, Save
 * Mod+S, Save all Mod+Alt+S, Quick open Mod+P, Terminal Ctrl+Backquote, New
 * terminal Ctrl+Shift+Backquote, Explorer Mod+B, New file Alt+N, Close tab
 * Alt+W. Keys the browser owns (Mod+W, Mod+N, Mod+T, Mod+1 to 9, Mod+L,
 * Mod+R) are never taken.
 */

const SPLIT = {
  explorer: { min: 160, max: 360, initial: 208 },
  dock: { min: 15, max: 85, initial: 32 },
  preview: { min: 20, max: 75, initial: 40 },
};
const session = { explorer: SPLIT.explorer.initial, dock: SPLIT.dock.initial, preview: SPLIT.preview.initial };
const DOCKS: DockPanel[] = ["terminal", "server", "ports", "api", "database", "problems", "results"];
const REVEAL_MS = 1500;

/** One store per workspace for the page's life, so switching back to a tab
    (or a part) is instant. */
const stores = new Map<string, WorkspaceStore>();
export function storeFor(props: WorkspaceProps): WorkspaceStore {
  let store = stores.get(props.id);
  if (!store) {
    store = new WorkspaceStore(props);
    stores.set(props.id, store);
  }
  return store;
}

const inTerminal = () => Boolean(document.activeElement?.closest("[data-terminal]"));
const mod = (e: KeyboardEvent) => (navigator.platform.toUpperCase().includes("MAC") ? e.metaKey : e.ctrlKey);

export function WorkspaceView({
  props,
  toolbarStart,
  toolbarEnd,
  next = null,
  onCheckDone,
  className = "",
}: {
  props: WorkspaceProps;
  /** Before the status (a Learn part's example tabs). */
  toolbarStart?: React.ReactNode;
  /** After Run (the Compiler button in full screen). */
  toolbarEnd?: React.ReactNode;
  /** Where Next goes once every check passes. */
  next?: { href: string; label: string } | null;
  /** A check finished: whether every criterion passed, and how many did. */
  onCheckDone?: (passed: boolean, summary: string) => void;
  className?: string;
}) {
  const store = useMemo(() => storeFor(props), [props]);
  useStore(store, "status", "tasks", "check", "dock", "preview", "files", "notice");
  const ideSettings = useIdeSettings();
  const [full, setFull] = useFullScreen();
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobile, setMobile] = useState<"files" | "code" | "dock" | "preview">("code");
  const [explorerWidth, setExplorerWidth] = useState(session.explorer);
  const [dockPct, setDockPct] = useState(session.dock);
  const [previewPct, setPreviewPct] = useState(session.preview);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const editorRowRef = useRef<HTMLDivElement>(null);
  const terminals = useRef(new Map<string, TerminalHandle>());
  const revealed = useRef(false);
  const tpl = props.template;
  const runName = store.runTask();
  const runState = runName ? store.tasks.get(runName)?.state : undefined;
  const running = runState === "running" || runState === "starting";
  const offline = store.runner === "offline";

  store.autosave = ideSettings.autosave && tpl.autosave;

  // Shows the region: once the live tree, the active file, and the tabs
  // are in, or at once when the runner can't answer.
  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    revealWorkspace();
  }, []);

  // A load: the address's file, line, dock, and preview, then the runner.
  useLayoutEffect(() => {
    const html = document.documentElement;
    // A page reached by a client-side navigation hides itself the same way
    // (a hard load's inline script already did).
    if (!html.hasAttribute("data-restore") && !html.hasAttribute("data-restore-editor")) html.setAttribute(rootRef.current?.closest("[data-editor-pane]") ? "data-restore-editor" : "data-restore", "");
    const timer = window.setTimeout(reveal, REVEAL_MS);
    store.hydrate();
    const file = urlParam("file");
    if (file && store.nodes.get(file)?.type === "file") {
      const line = Number.parseInt(urlParam("line"), 10);
      store.openFile(file, Number.isFinite(line) && line > 0 ? { line } : {});
    }
    const dock = urlParam("dock") as DockPanel;
    if (DOCKS.includes(dock)) store.setDock(dock);
    const controller = new AbortController();
    void store.connect(controller.signal).then(() => {
      if (store.runner === "offline") reveal();
    });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      store.dispose();
      stores.delete(store.id);
    };
  }, [store, reveal]);

  // Ready: the live tree, and the active file read (or nothing to read).
  const activeBuf = store.active ? store.buffers.get(store.active) : undefined;
  useEffect(() => {
    if (revealed.current) return;
    const fileReady = !store.active || (activeBuf && activeBuf.status !== "loading");
    if (store.live && fileReady) requestAnimationFrame(reveal);
  });

  // The address follows the IDE (lib/url-state.ts).
  useEffect(() => {
    if (!revealed.current && !store.live) return;
    writeUrl({
      file: store.active ?? null,
      dock: store.dockOpen && store.dock !== "terminal" ? store.dock : null,
      preview: store.preview.open ? store.preview.path : null,
      line: null,
    });
  }, [store, store.active, store.dock, store.dockOpen, store.preview.open, store.preview.path]);

  // A preview in the address opens once something listens.
  const wantPreview = useRef<string | null>(null);
  useEffect(() => {
    const p = urlParam("preview");
    if (p) wantPreview.current = p.startsWith("/") ? p : `/${p}`;
  }, []);
  useStore(store, "ports");
  useEffect(() => {
    if (!wantPreview.current) return;
    const port = store.previewPort();
    if (port) {
      store.openPreview(port, wantPreview.current);
      wantPreview.current = null;
    }
  });

  // A check that finishes tells the page (a Learn part marks itself solved).
  const lastCheck = useRef(store.check);
  useEffect(() => {
    if (store.check === lastCheck.current) return;
    lastCheck.current = store.check;
    if (store.check.status === "done") onCheckDone?.(store.check.result.status === "passed", checkSummary(store.check.result.tests));
  });

  const run = useCallback(async () => {
    if (!runName || offline) return;
    store.setDock("server");
    // Every task the template marks starts (or restarts), in its order.
    let ok = true;
    for (const name of store.runTasks()) {
      const state = store.tasks.get(name)?.state;
      ok = (await store.startTask(name, state === "running" || state === "starting" ? "restart" : "start")) && ok;
    }
    // A web stack's server opens its preview on Run.
    if (ok && tpl.ports.some((p) => p.preview)) {
      const port = store.previewPort();
      if (port) store.openPreview(port, "/");
      else wantPreview.current = "/";
    }
  }, [runName, offline, store, tpl.ports]);
  const check = useCallback(() => void store.runCheck(), [store]);

  const focusTerminal = useCallback(
    async (fresh = false) => {
      store.setDock("terminal");
      const existing = store.terminals[0];
      if (!fresh && existing) return requestAnimationFrame(() => terminals.current.get(existing.sid)?.focus());
      const tab = await store.newTerminal();
      if (tab) requestAnimationFrame(() => terminals.current.get(tab.sid)?.focus());
    },
    [store]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rootRef.current?.isConnected || e.defaultPrevented) return;
      // Ctrl+Backquote: to the terminal, or back to the editor from it.
      if (e.ctrlKey && e.code === "Backquote") {
        e.preventDefault();
        if (e.shiftKey) return void focusTerminal(true);
        if (inTerminal()) return void (rootRef.current.querySelector<HTMLElement>(".cm-content")?.focus());
        return void focusTerminal();
      }
      if (inTerminal()) return;
      const k = e.key.toLowerCase();
      if (mod(e) && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          if (tpl.checks) check();
        } else void run();
      } else if (mod(e) && !e.shiftKey && k === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (mod(e) && e.altKey && (k === "s" || e.code === "KeyS")) {
        e.preventDefault();
        void store.saveAll();
      } else if (mod(e) && k === "s") {
        e.preventDefault();
        if (store.active) void store.save(store.active);
      } else if (mod(e) && k === "b") {
        e.preventDefault();
        store.toggleExplorer();
      } else if (e.altKey && !mod(e) && e.code === "KeyN") {
        e.preventDefault();
        store.toggleExplorer(true);
        window.dispatchEvent(new CustomEvent(`hu:ide-new:${store.id}`, { detail: "file" }));
      } else if (e.altKey && !mod(e) && e.code === "KeyW") {
        e.preventDefault();
        if (store.active) store.closeFile(store.active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, run, check, tpl.checks, focusTerminal]);

  const iconBtn = "inline-flex size-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-highlight hover:text-ink";
  const previewOpen = store.preview.open && store.preview.port !== null;
  const checkBusy = store.check.status === "running";
  const ideStyle = {
    "--ide-explorer": `${explorerWidth}px`,
    "--ide-dock": `${dockPct}%`,
    "--ide-preview": `${previewPct}%`,
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      data-ide
      data-workspace-id={store.id}
      data-settled={store.settled ? "" : undefined}
      style={ideStyle}
      className={`@container flex min-h-0 flex-1 flex-col bg-surface ${className}`}
    >
      {/* Toolbar */}
      <div className="slim-scroll flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-line px-2">
        {toolbarStart}
        <StatusPill store={store} />
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setFull((was) => !was)}
            title={full ? "Exit full screen" : "Full screen"}
            aria-label="Toggle full screen"
            aria-pressed={full}
            className={`${iconBtn} hidden lg:inline-flex`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
          <ResetMenu store={store} className={iconBtn} />
          <EditorSettingsButton
            buttonClassName={`${iconBtn} shrink-0`}
            className="shrink-0"
            tools={
              <div className="w-full space-y-2">
                <CodeThemePicker className="field w-full rounded-btn px-2 py-1.5 text-xs font-medium text-ink" />
                <SettingRow label="Auto save" hint="Saves 1 second after you stop typing" on={ideSettings.autosave} onToggle={() => setIdeSetting("autosave", !ideSettings.autosave)} />
                <SettingRow label="Option as Meta" hint="Alt+B and Alt+F move by word in the terminal" on={ideSettings.optionIsMeta} onToggle={() => setIdeSetting("optionIsMeta", !ideSettings.optionIsMeta)} />
                <SettingRow label="Terminal screen reader mode" on={ideSettings.screenReader} onToggle={() => setIdeSetting("screenReader", !ideSettings.screenReader)} />
                <SettingRow label="Show hidden files" hint=".git and other hidden paths" on={ideSettings.hiddenFiles} onToggle={() => setIdeSetting("hiddenFiles", !ideSettings.hiddenFiles)} />
                <p className="text-[11px] leading-4 text-ink-faint">
                  Run Mod+Enter · Check Mod+Shift+Enter · Save Mod+S · Quick open Mod+P · Terminal Ctrl+` · Explorer Mod+B · New file Alt+N · Close tab Alt+W
                </p>
              </div>
            }
          />
          {runName && (
            <button
              type="button"
              onClick={() => void run()}
              disabled={offline || runState === "starting"}
              aria-busy={runState === "starting"}
              title={offline ? store.runnerMessage : running ? `Restart ${runName}` : `Run ${tpl.tasks.find((t) => t.name === runName)?.cmd ?? runName}`}
              className={`shrink-0 rounded-btn border border-edge-strong px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                tpl.checks ? "text-ink hover:bg-highlight" : "btn-grad px-4"
              }`}
            >
              ▶ Run
            </button>
          )}
          {tpl.checks && (
            <button
              type="button"
              onClick={check}
              disabled={offline || checkBusy}
              aria-busy={checkBusy}
              title={offline ? store.runnerMessage : "Check your work against the hidden checks (Mod+Shift+Enter)"}
              className="shrink-0 rounded-btn border border-edge-strong px-4 py-1.5 text-sm font-medium btn-grad disabled:opacity-50"
            >
              Check
            </button>
          )}
          {toolbarEnd}
        </div>
      </div>

      {offline && (
        <p role="status" className="shrink-0 border-b border-line bg-raised px-3 py-1.5 text-xs text-ink">
          {store.runnerMessage} Until then, this is the codebase as it starts.
        </p>
      )}

      {/* Narrow screens: one region at a time. */}
      <div role="tablist" aria-label="Workspace regions" className="flex shrink-0 gap-1 border-b border-line px-2 py-1 lg:hidden">
        {(["files", "code", "dock", ...(previewOpen ? ["preview"] : [])] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={mobile === r}
            onClick={() => setMobile(r as typeof mobile)}
            className={`rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider ${mobile === r ? "bg-highlight text-ink dark:text-gold" : "text-ink-faint"}`}
          >
            {r === "files" ? "Files" : r === "code" ? "Code" : r === "dock" ? "Terminal" : "Preview"}
          </button>
        ))}
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={editorRowRef}
          className={`flex min-h-0 ${store.dockMax ? "hidden" : ""} ${store.dockOpen ? "lg:h-[calc(100%-var(--ide-dock))]" : "flex-1"} max-lg:flex-1 ${
            mobile === "dock" ? "max-lg:hidden" : ""
          }`}
        >
          {store.explorerOpen && (
            <>
              <div
                className={`min-h-0 shrink-0 lg:w-[var(--ide-explorer)] max-lg:flex-1 ${mobile === "files" ? "" : "max-lg:hidden"}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[role=treeitem]") && window.innerWidth < 1024) setMobile("code");
                }}
              >
                <Explorer
                  store={store}
                  hiddenFiles={ideSettings.hiddenFiles}
                  onRevealInTerminal={(dir) => {
                    const first = store.terminals[0];
                    if (!first) return;
                    store.setDock("terminal");
                    terminals.current.get(first.sid)?.session?.type(`cd /workspace${dir ? `/${dir}` : ""}`);
                    requestAnimationFrame(() => terminals.current.get(first.sid)?.focus());
                  }}
                />
              </div>
              <ResizeHandle
                label="Resize the explorer"
                value={explorerWidth}
                min={SPLIT.explorer.min}
                max={SPLIT.explorer.max}
                step={16}
                bigStep={48}
                onChange={(v) => setExplorerWidth((session.explorer = Math.min(SPLIT.explorer.max, Math.max(SPLIT.explorer.min, v))))}
                onDrag={(x) => {
                  const left = editorRowRef.current?.getBoundingClientRect().left ?? 0;
                  setExplorerWidth((session.explorer = Math.min(SPLIT.explorer.max, Math.max(SPLIT.explorer.min, Math.round(x - left)))));
                }}
                onReset={() => setExplorerWidth((session.explorer = SPLIT.explorer.initial))}
                className="hidden lg:flex"
              />
            </>
          )}
          <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${mobile === "code" ? "" : "max-lg:hidden"}`}>
            <EditorTabs store={store} />
            <EditorGroup store={store} onRun={() => void run()} onCheck={tpl.checks ? check : undefined} className="min-h-0 flex-1" />
          </div>
          {previewOpen && (
            <>
              <ResizeHandle
                label="Resize the preview"
                value={previewPct}
                min={SPLIT.preview.min}
                max={SPLIT.preview.max}
                step={5}
                bigStep={10}
                onChange={(v) => setPreviewPct((session.preview = Math.min(SPLIT.preview.max, Math.max(SPLIT.preview.min, 100 - v))))}
                onDrag={(x) => {
                  const r = editorRowRef.current?.getBoundingClientRect();
                  if (r && r.width) setPreviewPct((session.preview = Math.min(SPLIT.preview.max, Math.max(SPLIT.preview.min, Math.round(((r.right - x) / r.width) * 100)))));
                }}
                onReset={() => setPreviewPct((session.preview = SPLIT.preview.initial))}
                className="hidden lg:flex"
              />
              <div className={`min-h-0 shrink-0 lg:w-[var(--ide-preview)] max-lg:flex-1 ${mobile === "preview" ? "" : "max-lg:hidden"}`}>
                <PreviewPane store={store} />
              </div>
            </>
          )}
        </div>
        {store.dockOpen && !store.dockMax && (
          <ResizeHandle
            orientation="horizontal"
            label="Resize the terminal panel"
            value={100 - dockPct}
            min={100 - SPLIT.dock.max}
            max={100 - SPLIT.dock.min}
            step={5}
            bigStep={10}
            onChange={(v) => setDockPct((session.dock = Math.min(SPLIT.dock.max, Math.max(SPLIT.dock.min, 100 - v))))}
            onDrag={(y) => {
              const r = bodyRef.current?.getBoundingClientRect();
              if (r && r.height) setDockPct((session.dock = Math.min(SPLIT.dock.max, Math.max(SPLIT.dock.min, Math.round(((r.bottom - y) / r.height) * 100)))));
            }}
            onReset={() => setDockPct((session.dock = SPLIT.dock.initial))}
            className="hidden lg:flex"
          />
        )}
        <div
          className={`min-h-0 ${store.dockMax ? "flex-1" : store.dockOpen ? "lg:h-[var(--ide-dock)]" : ""} ${
            mobile === "dock" ? "max-lg:flex-1" : store.dockOpen ? "max-lg:hidden" : ""
          }`}
        >
          <Dock store={store} terminalsRef={terminals} onNext={next} />
        </div>
      </div>
      <p role="status" className="sr-only">
        {store.notice}
      </p>
      {quickOpen && <QuickOpen store={store} onClose={() => setQuickOpen(false)} />}
    </div>
  );
}

function SettingRow({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-4 rounded-btn px-1 py-0.5 text-left transition-colors hover:bg-highlight"
    >
      <span>
        <span className="block text-ink-muted">{label}</span>
        {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}
