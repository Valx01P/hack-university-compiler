import { getTicket, WorkspaceError } from "@/lib/workspace-client";

/**
 * A workspace's events socket (architecture §3.3): status, file changes,
 * ports, tasks, check results, diagnostics, and limits, pushed by the runner
 * at ws://127.0.0.1:<port>/v1/ws/events. Each connection starts with a fresh
 * single-use ticket from /api/tickets as its first message (never in the
 * address), and `since`, the last file event seen, so a reconnect misses
 * nothing. It reconnects by itself with backoff, and while the tab is
 * visible it sends a heartbeat every 30 seconds, which keeps the workspace
 * from stopping as idle and from being stopped to make room for another.
 */

export type RunnerEvent =
  | { t: "ready"; workspace: string; seq: number; resync?: boolean }
  | { t: "terminal"; sid: string; state: "exited"; code?: number | null }
  | { t: "status"; status: string; detail?: string; mem?: { usedMb: number; limitMb: number } }
  | { t: "fs"; seq: number; events: FsEvent[] }
  | { t: "port"; port: number; url: string; state: "listening" | "closed"; bind?: string; process?: string; framable?: boolean; reason?: string; note?: string; env?: string; label?: string; preview?: boolean }
  | { t: "task"; name: string; state: "starting" | "running" | "exited"; code?: number | null; signal?: string | null; sid?: string }
  | { t: "check"; checkId: string; phase: string; test?: Record<string, unknown>; result?: Record<string, unknown> }
  | { t: "diag"; source: string; items: { file: string; line: number; col: number; severity: string; code?: string; message: string }[] }
  | { t: "limit"; kind: string; message: string }
  | { t: "image"; image: string; phase: string; progress?: number; line?: string }
  | { t: "docker"; state: "up" | "down" | "waking" }
  | { t: "db"; state: string };

/** One file change: ["add" | "change" | "unlink" | "addDir" | "unlinkDir", path, entry?],
    where entry is the path's tree row (its mark included). */
export type FsEvent = [
  string,
  string,
  { type?: string; size?: number; mtimeMs?: number; mode?: number; state?: string; target?: string; outside?: boolean; heavy?: boolean }?,
];

export type SocketState = "connecting" | "open" | "closed";

const HEARTBEAT_MS = 30_000;

export class WorkspaceEvents {
  private ws: WebSocket | null = null;
  private since: number | null = null;
  private retry = 0;
  private timer = 0;
  private heartbeat = 0;
  private stopped = false;
  state: SocketState = "closed";

  constructor(
    private readonly workspace: string,
    private readonly onEvent: (event: RunnerEvent) => void,
    private readonly onState: (state: SocketState, error?: WorkspaceError) => void
  ) {}

  start() {
    this.stopped = false;
    void this.connect();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    window.clearInterval(this.heartbeat);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ws?.close(1000, "bye");
    this.ws = null;
  }

  /** Reconnect now (after the runner comes back, say). */
  reconnect() {
    if (this.stopped || this.state !== "closed") return;
    window.clearTimeout(this.timer);
    void this.connect();
  }

  private setState(state: SocketState, error?: WorkspaceError) {
    this.state = state;
    this.onState(state, error);
  }

  private onVisibility = () => this.beat();

  /** A heartbeat: it keeps the workspace from stopping as idle, and while the
      tab is visible, from being stopped to make room (LRU). A hidden tab says
      so at once. */
  private beat() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: "hb", visible: document.visibilityState === "visible" }));
  }

  private async connect() {
    if (this.stopped) return;
    this.setState("connecting");
    let ticket: { ticket: string; url: string };
    try {
      ticket = await getTicket(this.workspace, "events");
    } catch (err) {
      this.setState("closed", err instanceof WorkspaceError ? err : undefined);
      return this.later();
    }
    if (this.stopped) return;
    const ws = new WebSocket(`${ticket.url}/v1/ws/events`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", ticket: ticket.ticket, ...(this.since !== null ? { since: this.since } : {}) }));
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let event: RunnerEvent;
      try {
        event = JSON.parse(e.data) as RunnerEvent;
      } catch {
        return;
      }
      if (event.t === "ready") {
        this.retry = 0;
        this.since ??= event.seq;
        this.setState("open");
        window.clearInterval(this.heartbeat);
        // Only a tab that shows the workspace keeps it awake.
        this.heartbeat = window.setInterval(() => document.visibilityState === "visible" && this.beat(), HEARTBEAT_MS);
        this.beat();
      }
      if (event.t === "fs") {
        if (this.since !== null && event.seq <= this.since) return;
        this.since = event.seq;
      }
      this.onEvent(event);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      window.clearInterval(this.heartbeat);
      this.setState("closed");
      this.later();
    };
  }

  /** Tries again: soon at first, then every 5 seconds. */
  private later() {
    if (this.stopped) return;
    const wait = Math.min(5000, 250 * 2 ** this.retry++);
    this.timer = window.setTimeout(() => void this.connect(), wait);
  }
}
