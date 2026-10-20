"use client";

import { useState } from "react";
import { TerminalView, type TerminalHandle } from "@/components/ide/terminal-view";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The Server panel (architecture §8.3): a task's log, read only, with Start,
 * Restart, Stop, and Ctrl+C, and a dot for where it is (starting, running,
 * exited). Only the template's tasks can start, by name. A task keeps
 * running when you reload or close the tab, and its log comes back.
 */
export function ServerPanel({ store }: { store: WorkspaceStore }) {
  useStore(store, "tasks", "status");
  const tasks = store.props.template.tasks;
  const runName = store.runTask();
  const [chosen, setChosen] = useState<string | null>(null);
  const [handle, setHandle] = useState<TerminalHandle | null>(null);
  // The task you picked, else the one running, else the one Run starts.
  const running = tasks.find((t) => {
    const s = store.tasks.get(t.name)?.state;
    return s === "running" || s === "starting";
  });
  const name = chosen ?? running?.name ?? runName ?? tasks[0]?.name ?? null;
  const task = tasks.find((t) => t.name === name);
  const state = name ? store.tasks.get(name) : undefined;
  const live = state?.state === "running" || state?.state === "starting";
  const offline = store.runner === "offline";
  const btn = "rounded-btn border border-edge-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-highlight disabled:opacity-50";

  if (!task) return <p className="p-4 text-sm text-ink-faint">This workspace has no tasks to run.</p>;
  const status =
    state?.state === "starting"
      ? "starting"
      : state?.state === "running"
        ? "running"
        : state?.state === "exited"
          ? state.signal
            ? `stopped (${state.signal})`
            : `exited${state.code !== null && state.code !== undefined ? ` (${state.code})` : ""}`
          : "not started";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <label className="flex items-center gap-1.5 text-xs text-ink-faint">
          <span className="sr-only">Task</span>
          <select value={name ?? ""} onChange={(e) => setChosen(e.target.value)} className="field rounded-btn py-0.5 pl-2 text-xs text-ink sm:text-xs">
            {tasks.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label === t.name ? t.name : `${t.label} (${t.name})`}
              </option>
            ))}
          </select>
        </label>
        <code className="min-w-0 truncate font-mono text-xs text-ink-muted" title={task.cmd}>
          {task.cmd}
        </code>
        <span className="inline-flex w-28 shrink-0 items-center gap-1.5 text-xs text-ink-faint" role="status">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${live ? "bg-gold" : "border border-ink-faint"}`} />
          {status}
        </span>
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          <button type="button" className={btn} disabled={offline} onClick={() => void store.startTask(task.name, live ? "restart" : "start")}>
            {live ? "Restart" : "Start"}
          </button>
          <button type="button" className={btn} disabled={!live} onClick={() => handle?.session?.interrupt()} title="Send Ctrl+C (SIGINT)">
            Ctrl+C
          </button>
          <button type="button" className={btn} disabled={!live} onClick={() => void store.startTask(task.name, "stop")}>
            Stop
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {state?.sid ? (
          <TerminalView key={state.sid} store={store} sid={state.sid} label={`${task.label} log`} readOnly visible handleRef={setHandle} />
        ) : (
          <p className="p-4 text-sm text-ink-faint">
            {offline ? store.runnerMessage : `Press Start (or Run) to run ${task.cmd}. Its output shows here.`}
          </p>
        )}
      </div>
    </div>
  );
}
