"use client";

import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The workspace's state in a fixed-width slot (architecture §8.1), so
 * nothing moves when it changes: Stopped, Starting, Running on its port
 * with memory against the limit, Crashed, Waking Docker, Docker is off, or
 * the runner isn't running. Its title says what to do about it.
 */
export function StatusPill({ store }: { store: WorkspaceStore }) {
  useStore(store, "status", "ports", "tasks");
  const port = [...store.ports.values()].find((p) => p.state === "listening")?.port;
  const crashed = [...store.tasks.values()].find((t) => t.state === "exited" && t.code !== null && t.code !== undefined && t.code !== 0 && !t.signal);
  let label: string;
  let hint: string;
  let on = false;
  if (store.runner === "offline") {
    label = "Runner offline";
    hint = store.runnerMessage;
  } else if (store.runner === "connecting") {
    label = "Opening";
    hint = "Opening the workspace";
  } else if (store.docker === "down") {
    label = "Docker is off";
    hint = "Start Docker to run this. Your files still open and save.";
  } else if (store.docker === "waking" || /waking/i.test(store.statusDetail)) {
    label = "Waking Docker";
    hint = "Docker is waking up (3 to 10 seconds).";
  } else if (store.status === "starting") {
    label = "Starting";
    hint = store.statusDetail || "Starting the workspace";
  } else if (store.status === "running") {
    on = true;
    label = crashed ? `Crashed (${crashed.name})` : port ? `Running :${port}` : "Running";
    hint = store.mem ? `${store.mem.usedMb} MB of ${store.mem.limitMb >= 1024 ? `${store.mem.limitMb / 1024} GB` : `${store.mem.limitMb} MB`}` : "Running";
  } else if (store.status === "error") {
    label = "Error";
    hint = store.statusDetail || "The workspace couldn't start.";
  } else {
    label = "Stopped";
    hint = "Files are saved. Run or a terminal starts the workspace.";
  }
  const mem = store.status === "running" && store.mem ? `${store.mem.usedMb} MB` : "";
  return (
    <span title={hint} className="inline-flex w-32 shrink-0 items-center gap-1.5 overflow-hidden px-1 font-mono text-xs text-ink-faint @3xl:w-56" role="status">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${on ? "bg-gold" : "border border-ink-faint"}`} />
      <span className="truncate">{label}</span>
      {mem && <span className="shrink-0 text-ink-faint">· {mem}</span>}
    </span>
  );
}
