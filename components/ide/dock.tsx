"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Plus, X } from "lucide-react";
import { TerminalView, type TerminalHandle } from "@/components/ide/terminal-view";
import { ServerPanel } from "@/components/ide/server-panel";
import { PortsPanel } from "@/components/ide/ports-panel";
import { ApiPanel } from "@/components/ide/api-panel";
import { DatabasePanel } from "@/components/ide/database-panel";
import { ProblemsPanel } from "@/components/ide/problems-panel";
import { ResultsPanel } from "@/components/ide/results-panel";
import { useStore, type DockPanel, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The bottom dock (architecture §8.1, §8.3): Terminal 1 to 4 and +, then the
 * Server log, Ports, API, Database, Problems, and Results, each behind its tab. Only
 * the template's panels show, plus Ports and API once something listens, and
 * Results when the workspace has checks. Hidden terminals stay mounted, so
 * they keep their screens. It opens on Terminal 1. Run opens Server, Check
 * opens Results, and nothing else opens by itself.
 */

const LABELS: Record<Exclude<DockPanel, "terminal">, string> = {
  server: "Server",
  ports: "Ports",
  api: "API",
  database: "Database",
  problems: "Problems",
  results: "Results",
};

export function Dock({
  store,
  terminalsRef,
  onNext,
}: {
  store: WorkspaceStore;
  /** The live terminals, for Ctrl+Backquote and Reveal in terminal. */
  terminalsRef: React.RefObject<Map<string, TerminalHandle>>;
  /** Where Next goes once every check passes. */
  onNext?: { href: string; label: string } | null;
}) {
  useStore(store, "dock", "terminals", "ports", "diag", "check", "tasks");
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const tpl = store.props.template;
  const panels = new Set<string>(tpl.panels);
  if (tpl.tasks.length) panels.add("server");
  if (store.ports.size || tpl.ports.length) {
    panels.add("ports");
    panels.add("api");
  }
  if (tpl.checks) panels.add("results");
  if (store.diagnostics.size) panels.add("problems");
  const order: DockPanel[] = ["server", "ports", "api", "database", "problems", "results"];
  const shown = order.filter((p) => panels.has(p));
  const terminals = store.terminals;
  const currentTerm = terminals.find((t) => t.sid === activeTerm)?.sid ?? terminals[0]?.sid ?? null;
  const problems = [...store.diagnostics.values()].reduce((n, list) => n + list.length, 0);

  // Terminal 1 is there from the start, and its shell starts when you
  // click into it (the workspace stays files only until then).
  const tabs: { id: string; label: string; panel: DockPanel; sid?: string }[] = [
    ...(terminals.length ? terminals.map((t) => ({ id: `term:${t.sid}`, label: t.title, panel: "terminal" as const, sid: t.sid })) : [{ id: "term:", label: "Terminal 1", panel: "terminal" as const }]),
    ...shown.map((p) => ({ id: p, label: p === "ports" ? `Ports${store.ports.size ? ` (${store.ports.size})` : ""}` : p === "problems" && problems ? `Problems (${problems})` : LABELS[p as Exclude<DockPanel, "terminal">], panel: p })),
  ];
  const selectedId = store.dock === "terminal" ? `term:${currentTerm ?? ""}` : store.dock;

  async function addTerminal() {
    const tab = await store.newTerminal();
    if (tab) {
      setActiveTerm(tab.sid);
      store.setDock("terminal");
      requestAnimationFrame(() => terminalsRef.current?.get(tab.sid)?.focus());
    }
  }

  function select(i: number) {
    const tab = tabs[(i + tabs.length) % tabs.length];
    if (!tab) return;
    if (tab.sid) setActiveTerm(tab.sid);
    store.setDock(tab.panel);
    tabRefs.current.get(tab.id)?.focus();
  }

  const iconBtn = "inline-flex size-6 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink";
  const taskRunning = [...store.tasks.values()].some((t) => t.state === "running" || t.state === "starting");

  return (
    <section aria-label="Terminal and panels" className="stars-through flex h-full min-h-0 flex-col border-t border-line bg-surface">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line pl-1 pr-1.5">
        <div role="tablist" aria-label="Panels" className="slim-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab, i) => {
            const selected = tab.id === selectedId && store.dockOpen;
            return (
              <span key={tab.id} className="group inline-flex shrink-0 items-center">
                <button
                  ref={(el) => {
                    if (el) tabRefs.current.set(tab.id, el);
                    else tabRefs.current.delete(tab.id);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={tab.id === selectedId ? 0 : -1}
                  onClick={() => {
                    if (tab.sid) setActiveTerm(tab.sid);
                    store.setDock(tab.panel);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") select(i + 1);
                    else if (e.key === "ArrowLeft") select(i - 1);
                    else if (e.key === "Home") select(0);
                    else if (e.key === "End") select(tabs.length - 1);
                    else return;
                    e.preventDefault();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-btn px-2 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                    selected ? "bg-raised text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
                  }`}
                >
                  {tab.label}
                  {tab.panel === "server" && (
                    <span aria-hidden className={`size-1.5 rounded-full ${taskRunning ? "bg-gold" : "border border-ink-faint"}`} />
                  )}
                </button>
                {tab.sid && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Close ${tab.label}`}
                    title={`Close ${tab.label} (ends its shell)`}
                    onClick={() => void store.closeTerminal(tab.sid!)}
                    className="-ml-1 inline-flex size-5 items-center justify-center rounded-btn text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => void addTerminal()}
            disabled={store.runner === "offline" || terminals.length >= 4}
            title={terminals.length >= 4 ? "At most 4 terminals. Close one first." : "New terminal (Ctrl+Shift+Backquote)"}
            aria-label="New terminal"
            className={`${iconBtn} disabled:opacity-40`}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
        <button type="button" onClick={() => store.toggleDockMax()} className={iconBtn} title={store.dockMax ? "Restore the panel" : "Maximize the panel"} aria-label={store.dockMax ? "Restore the panel" : "Maximize the panel"}>
          {store.dockMax ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => store.setDock(store.dockOpen ? null : store.dock)}
          className={iconBtn}
          title={store.dockOpen ? "Hide the panel" : "Show the panel"}
          aria-label={store.dockOpen ? "Hide the panel" : "Show the panel"}
          aria-expanded={store.dockOpen}
        >
          {store.dockOpen ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
        </button>
      </div>
      <div className={`relative min-h-0 flex-1 ${store.dockOpen ? "" : "hidden"}`} role="tabpanel">
        {terminals.length === 0 && store.dock === "terminal" && (
          <button
            type="button"
            disabled={store.runner === "offline"}
            onClick={() => void addTerminal()}
            className="code-dark flex h-full w-full items-start bg-code-bg px-3 py-2 text-left font-mono text-xs text-code-gutter outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--code-ink)]"
          >
            {store.runner === "offline"
              ? store.runnerMessage
              : "Click here (or press Enter) to start a shell in /workspace. It starts the workspace, which takes about a second."}
          </button>
        )}
        {terminals.map((t) => (
          <TerminalView
            key={t.sid}
            store={store}
            sid={t.sid}
            label={`${t.title}, bash in /workspace`}
            visible={store.dock === "terminal" && t.sid === currentTerm}
            handleRef={(h) => {
              if (h) terminalsRef.current?.set(t.sid, h);
              else terminalsRef.current?.delete(t.sid);
            }}
          />
        ))}
        {store.dock === "server" && <ServerPanel store={store} />}
        {store.dock === "ports" && <PortsPanel store={store} />}
        {store.dock === "api" && <ApiPanel store={store} />}
        {store.dock === "database" && <DatabasePanel store={store} />}
        {store.dock === "problems" && <ProblemsPanel store={store} />}
        {store.dock === "results" && <ResultsPanel store={store} next={onNext ?? null} />}
      </div>
    </section>
  );
}
