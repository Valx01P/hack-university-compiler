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
 *   acknowledged once xterm has drawn it;
 * - a new size goes to the shell first, and the terminal takes it with the
 *   redraw that answers it, so a resize shows in one frame.
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
  /** A new size: the shell hears it at once, and the terminal takes it with
      the shell's redraw for it (below). */
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
/** After a new size, the shell's output waits this long past its last piece
    (a shell that doesn't mark its redraw), */
const QUIET_MS = 50;
/** and never longer than this (nothing came, or a redraw never ended). */
const HOLD_MS = 300;
/** ESC [ ? 2026 h and l: where a synchronized update (a redraw) starts and ends. */
const SYNC_START = [0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x68];
const SYNC_END = [0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x6c];
/** The bridge's own OSC, never sent to the shell: "take the new size here". */
const SIZE_OSC = 8371;

/** Where `seq` last starts in `bytes`, or -1. */
function lastIndex(bytes: Uint8Array, seq: number[]): number {
  outer: for (let i = bytes.length - seq.length; i >= 0; i--) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

export function attachTerminal(term: Terminal, opts: BridgeOptions): TerminalSession {
  let ws: WebSocket | null = null;
  let disposed = false;
  let retry = 0;
  let timer = 0;
  let unacked = 0;
  // Another tab is the writer: the runner takes no size from this one.
  let watching = false;
  const encoder = new TextEncoder();

  // A new size goes to the shell first, and the terminal takes it with the
  // redraw that answers it. Resized first, xterm rewraps the old screen for
  // the new width (tmux's included), and that shows until the redraw comes
  // in, a jump and back: the flicker as a window or a border moves. So once
  // the size goes, the shell's output waits (the old screen still showing)
  // until its redraw is whole, tmux's marked as a synchronized update
  // (runner/tmux.conf), another shell's once it goes quiet. Then the resize
  // and all of it go to xterm together, parsed in one go and drawn in one
  // frame.
  let sized: { cols: number; rows: number } | null = null;
  let held: { bytes: Uint8Array; done: () => void }[] = [];
  let redrawing = false;
  let quiet = 0;
  let cap = 0;
  // The resize rides in front of what was held, as the bridge's own
  // sequence, in one write: xterm parses a write whole, where between
  // writes it may stop to draw (it does after 12ms, and a resize, the
  // scrollback rewrapped and WebGL's canvas made again, takes about that).
  // The token keeps a program's output from resizing it.
  const token = Math.random().toString(36).slice(2);
  const sizes: { cols: number; rows: number }[] = [];
  const sizeMark = term.parser.registerOscHandler(SIZE_OSC, (data) => {
    if (data !== token) return false;
    const size = sizes.shift();
    if (size && (size.cols !== term.cols || size.rows !== term.rows)) term.resize(size.cols, size.rows);
    return true;
  });
  const release = () => {
    window.clearTimeout(quiet);
    window.clearTimeout(cap);
    const size = sized;
    const chunks = held;
    sized = null;
    held = [];
    redrawing = false;
    if (!size) return;
    sizes.push(size);
    const mark = encoder.encode(`\x1b]${SIZE_OSC};${token}\x07`);
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.bytes.length, mark.length));
    all.set(mark);
    let at = mark.length;
    for (const chunk of chunks) {
      all.set(chunk.bytes, at);
      at += chunk.bytes.length;
    }
    term.write(all, () => chunks.forEach((chunk) => chunk.done()));
  };
  const output = (bytes: Uint8Array, done: () => void) => {
    if (!sized) return term.write(bytes, done);
    held.push({ bytes, done });
    const start = lastIndex(bytes, SYNC_START);
    const end = lastIndex(bytes, SYNC_END);
    if (end > start) return release();
    if (start >= 0) redrawing = true;
    window.clearTimeout(quiet);
    if (!redrawing) quiet = window.setTimeout(release, QUIET_MS);
  };

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
        output(bytes, () => {
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
        watching = msg.readonly === true;
        if (!opts.readOnly) opts.onMode?.(watching);
      } else if (msg.t === "mode") {
        watching = msg.readonly === true;
        if (!opts.readOnly) opts.onMode?.(watching);
      } else if (msg.t === "replay" && typeof msg.data === "string") {
        // The screen as it was, over a clean one: a reload, or a reconnect.
        // The reset (ESC c) rides in the same write, so no frame shows the
        // screen empty in between.
        release();
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
      // No shell to redraw: the next hello sends the size.
      release();
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
      const want = sized ?? { cols: term.cols, rows: term.rows };
      if (cols === want.cols && rows === want.rows) return;
      sendText({ t: "resize", cols, rows });
      sized = { cols, rows };
      // Nothing will redraw for it (no shell yet, or one that takes no size
      // from this tab): at once.
      if (opts.readOnly || watching || !open || ws?.readyState !== WebSocket.OPEN) return release();
      window.clearTimeout(cap);
      cap = window.setTimeout(release, HOLD_MS);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      sizeMark.dispose();
      onData.dispose();
      onBinary.dispose();
      ws?.close(1000, "bye");
      ws = null;
    },
  };
}
