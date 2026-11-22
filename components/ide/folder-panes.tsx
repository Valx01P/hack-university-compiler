"use client";

import { useEffect, useRef, useState } from "react";
import { TerminalView } from "@/components/ide/terminal-view";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * What a folder on this computer shows in the compiler and the playground
 * besides its files and the editor: the one terminal in it, and what shows
 * while the runner is opening the folder or isn't running.
 */

export function FolderUnavailable({ store, opening }: { store: WorkspaceStore; opening: string }) {
  return (
    <p className="p-4 text-sm text-ink-muted" role="status">
      {store.runner === "connecting" ? opening : store.runnerMessage || "The workspace runner isn't running. Start it with npm run up."}
    </p>
  );
}

/** One shell on this computer, in the folder, started the first time it
    shows, kept through reloads, and kept in tmux (runner/host-tmux.ts) when
    you leave or the app restarts: showing it again attaches to the same
    shell. `onOpenFile` opens a file:line link's file. */
export function FolderTerminal({
  store,
  visible,
  onOpenFile,
  opening,
}: {
  store: WorkspaceStore;
  visible: boolean;
  onOpenFile?: (path: string, line: number) => void;
  /** What it says while the folder opens ("Opening the playground…"). */
  opening: string;
}) {
  useStore(store, "status", "terminals");
  const tab = store.terminals[0] ?? null;
  const [starting, setStarting] = useState(false);
  // Starts that failed in a row: the runner may still be coming up (the app
  // restarted), so a few more tries, a moment apart, before asking.
  const [failures, setFailures] = useState(0);
  const failed = failures >= 4;
  const last = useRef<string | null>(null);
  if (tab) last.current = tab.sid;
  // The shell ended (exit): a new one starts only when you ask. One only
  // gone from the runner's list (the app restarted) comes back on its own,
  // since in tmux it's still running and starting one attaches to it. Worked
  // out as it renders, so the start below never runs ahead of it.
  const ended = !tab && last.current !== null && store.exitedTerminals.has(last.current);

  async function start(asked = false) {
    if (asked) setFailures(0);
    setStarting(true);
    const opened = await store.newTerminal();
    setStarting(false);
    setFailures((n) => (opened ? 0 : n + 1));
  }

  useEffect(() => {
    // Wait for the runner's word on shells that kept running (a reload).
    if (!visible || tab || starting || ended || failed || store.runner !== "online" || !store.settled) return;
    const timer = window.setTimeout(() => void start(), failures ? 1_500 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tab, starting, ended, failed, failures, store.runner, store.settled]);

  if (store.runner !== "online") return <FolderUnavailable store={store} opening={opening} />;
  if (!tab) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 text-sm text-ink-muted" role="status">
        {ended || failed ? (
          <>
            <p>{failed ? "Couldn't start a shell." : "The shell ended."}</p>
            <button type="button" onClick={() => void start(true)} className="rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad">
              {failed ? "Try again" : "Start a new shell"}
            </button>
          </>
        ) : (
          <p>Starting a shell in this folder…</p>
        )}
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1">
      <TerminalView store={store} sid={tab.sid} label="Terminal" visible={visible} onOpenFile={onOpenFile} />
    </div>
  );
}
