import type { Terminal } from "@xterm/xterm";
import { getTicket } from "@/lib/workspace-client";

/**
 * Joins an xterm.js terminal to a runner terminal session over its socket,
 * ws://127.0.0.1:<port>/v1/ws/term/<sid> (architecture §3.3). Not
 * @xterm/addon-attach, which prints every frame it gets, control messages
 * included. Here:
 *
 * - the first message is the hello with a fresh ticket and the terminal's
 *   size, so the first prompt wraps right;
 * - output arrives as binary frames, and keystrokes go back as binary;
 * - text frames carry control: `ready`, `replay` (the screen and its
 *   scrollback after a reload, written over a clean screen), `exit`,
 *   `resize`, `signal`, and `ack`, the flow control the runner pauses its
 *   stream on (it waits above 100,000 unacknowledged bytes): each write is
 *   acknowledged once xterm has drawn it.
 *
 * A dropped socket reconnects (the shell keeps running in the workspace) and
 * the replay puts the screen back. Returns what drives the session.
 */

export interface TerminalSession {
  /** Sends Ctrl+C as a signal (the Stop button), not as typed text. */
  interrupt(): void;
  /** Makes this tab the terminal's writer (another tab typed in it last). */
  takeOver(): void;
  /** Types text at the prompt without pressing Enter (Paste into terminal). */
  type(text: string): void;
  /** Sends the terminal's current size. */
  resize(cols: number, rows: number): void;
  dispose(): void;
}

export interface BridgeOptions {
  workspace: string;
  sid: string;
  /** Read only: nothing typed is sent (a task's log, or a second tab). */
  readOnly?: boolean;
  onReady?: (info: { cwd?: string; shell?: string }) => void;
  onExit?: (exit: { code: number | null; signal: string | null }) => void;
  /** The session is gone (the runner closed it, or it restarted). */
  onGone?: (reason: string) => void;
  onConnection?: (state: "connecting" | "open" | "closed") => void;
  /** Read only (another tab writes), or the writer again. */
  onMode?: (readOnly: boolean) => void;
}

const ACK_EVERY = 64 * 1024;

export function attachTerminal(term: Terminal, opts: BridgeOptions): TerminalSession {
  let ws: WebSocket | null = null;
  let disposed = false;
  let retry = 0;
  let timer = 0;
  let unacked = 0;
  const encoder = new TextEncoder();

  const sendText = (msg: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  // Keys typed while the socket reconnects wait here (up to 64 KB), then go.
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let open = false;
  const sendBytes = (data: Uint8Array) => {
    if (opts.readOnly) return;
    if (open && ws?.readyState === WebSocket.OPEN) ws.send(data);
    else if (pendingBytes + data.length <= 64 * 1024) {
      pending.push(data);
      pendingBytes += data.length;
    }
  };

  const onData = term.onData((data) => sendBytes(encoder.encode(data)));
  const onBinary = term.onBinary((data) => {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff;
    sendBytes(bytes);
  });

  async function connect() {
    if (disposed) return;
    opts.onConnection?.("connecting");
    let ticket: { ticket: string; url: string };
    try {
      ticket = await getTicket(opts.workspace, "term", opts.sid);
    } catch {
      return later();
    }
    if (disposed) return;
    const sock = new WebSocket(`${ticket.url}/v1/ws/term/${encodeURIComponent(opts.sid)}`);
    sock.binaryType = "arraybuffer";
    ws = sock;
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", ticket: ticket.ticket, cols: term.cols, rows: term.rows }));
    sock.onmessage = (e) => {
      if (typeof e.data !== "string") {
        const bytes = new Uint8Array(e.data as ArrayBuffer);
        unacked += bytes.length;
        // Acknowledged once xterm has processed it, so a flood (yes) pauses
        // at the runner instead of piling up here, and Ctrl+C answers at once.
        term.write(bytes, () => {
          if (unacked >= ACK_EVERY) {
            sendText({ t: "ack", bytes: unacked });
            unacked = 0;
          }
        });
        return;
      }
      let msg: { t?: string; data?: string; cwd?: string; shell?: string; code?: number | null; signal?: string | null; readonly?: boolean };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === "ready") {
        retry = 0;
        open = true;
        for (const data of pending) sock.send(data);
        pending = [];
        pendingBytes = 0;
        opts.onConnection?.("open");
        opts.onReady?.({ cwd: msg.cwd, shell: msg.shell });
        if (!opts.readOnly) opts.onMode?.(msg.readonly === true);
      } else if (msg.t === "mode") {
        if (!opts.readOnly) opts.onMode?.(msg.readonly === true);
      } else if (msg.t === "replay" && typeof msg.data === "string") {
        // The screen as it was, over a clean one: a reload, or a reconnect.
        // The reset (ESC c) rides in the same write, so no frame shows the
        // screen empty in between.
        term.write(`\x1bc${msg.data}`);
      } else if (msg.t === "exit") {
        opts.onExit?.({ code: msg.code ?? null, signal: msg.signal ?? null });
      } else if (msg.t === "ping") {
        sendText({ t: "pong" });
      }
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;
      ws = null;
      open = false;
      opts.onConnection?.("closed");
      // 4404: the session is gone. 4401 and 4403: the ticket was refused.
      if (e.code === 4404) {
        opts.onGone?.(e.reason || "The terminal has ended.");
        return;
      }
      later();
    };
  }

  function later() {
    if (disposed) return;
    const wait = Math.min(5000, 250 * 2 ** retry++);
    timer = window.setTimeout(() => void connect(), wait);
  }

  void connect();

  return {
    interrupt() {
      sendText({ t: "signal", sig: "INT" });
    },
    takeOver() {
      sendText({ t: "takeover" });
    },
    type(text: string) {
      sendBytes(encoder.encode(text));
    },
    resize(cols: number, rows: number) {
      sendText({ t: "resize", cols, rows });
    },
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
      onData.dispose();
      onBinary.dispose();
      ws?.close(1000, "bye");
      ws = null;
    },
  };
}
