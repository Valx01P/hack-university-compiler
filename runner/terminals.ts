import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import serializeAddon from "@xterm/addon-serialize";
import headless from "@xterm/headless";
import type Docker from "dockerode";
import { execCollect, execStream } from "./exec.ts";
import { Demux } from "./jobs.ts";

const { Terminal } = headless;
const { SerializeAddon } = serializeAddon;

/**
 * Terminals (architecture §3.3, §4.2.4): a shell is `bash -l` through docker
 * exec with a TTY, as uid 1000. Everything it prints goes to the sockets
 * attached to it and into an @xterm/headless mirror, so a socket that attaches
 * later (a reload, a second tab) gets the serialized screen and 5,000 lines of
 * scrollback first, the way VS Code does it.
 *
 * - One writer: the first socket, or the last to send takeover. Others are
 *   read-only until they take over.
 * - Flow control follows the xterm.js guide: above 100,000 bytes the writer
 *   hasn't acknowledged, the exec stream pauses (so the shell blocks on its
 *   writes and Ctrl+C answers at once), and it resumes below 10,000.
 * - A task's log view is the same kind of session reading the task's log
 *   (`tail -F`), read-only for everyone, where a signal goes to the task.
 */

const HIGH = 100_000;
const LOW = 10_000;
const SCROLLBACK = 5_000;
/** A read-only socket this far behind is dropped rather than buffered without end. */
const SLOW_BYTES = 8 * 1024 * 1024;

export interface TermSocket {
  sendText(message: Record<string, unknown>): void;
  sendBinary(data: Buffer): void;
  close(code: number, reason: string): void;
  readonly buffered: number;
}

export type TermKind = "shell" | "log";

export interface SessionInfo {
  sid: string;
  kind: TermKind;
  task?: string;
  cols: number;
  rows: number;
  exited: boolean;
  createdAt: number;
}

export function newSid(prefix: string): string {
  return `${prefix}${randomBytes(9).toString("base64url")}`;
}

export class TerminalSession {
  readonly sid: string;
  readonly kind: TermKind;
  readonly task?: string;
  readonly createdAt = Date.now();
  cols: number;
  rows: number;
  cwd: string;
  exited: { code: number | null; signal: string | null } | null = null;
  /** Called with each keystroke batch (activity for the idle timer). */
  onInput: () => void = () => {};
  /** Called when the shell ends. */
  onExit: (code: number | null) => void = () => {};
  /** For log views: a signal for the task. */
  onSignal: (sig: string) => void = () => {};

  private readonly container: Docker.Container;
  private readonly mirror: InstanceType<typeof Terminal>;
  private readonly serializer: InstanceType<typeof SerializeAddon>;
  private readonly sockets = new Set<TermSocket>();
  private writer: TermSocket | null = null;
  private exec: Docker.Exec | null = null;
  private stream: Duplex | null = null;
  private unacked = 0;
  private paused = false;
  private lastByte = 0;
  private graceTimer: NodeJS.Timeout | null = null;
  private killed = false;

  private constructor(container: Docker.Container, sid: string, kind: TermKind, cols: number, rows: number, cwd: string, task?: string) {
    this.container = container;
    this.sid = sid;
    this.kind = kind;
    this.task = task;
    this.cols = cols;
    this.rows = rows;
    this.cwd = cwd;
    this.mirror = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true });
    this.serializer = new SerializeAddon();
    this.mirror.loadAddon(this.serializer);
  }

  get info(): SessionInfo {
    return { sid: this.sid, kind: this.kind, task: this.task, cols: this.cols, rows: this.rows, exited: this.exited !== null, createdAt: this.createdAt };
  }

  get attached(): number {
    return this.sockets.size;
  }

  /** Starts `bash -l` with a TTY in `cwd`. */
  static async shell(
    container: Docker.Container,
    { cols, rows, cwd, env, user = "learner" }: { cols: number; rows: number; cwd: string; env: string[]; user?: string }
  ): Promise<TerminalSession> {
    const session = new TerminalSession(container, newSid("t"), "shell", cols, rows, cwd);
    const { exec, stream } = await execStream(
      container,
      ["sh", "-c", 'mkdir -p /tmp/hu/term && echo $$ > "/tmp/hu/term/$1.pid"; exec bash -l', "sh", session.sid],
      { tty: true, user, workDir: cwd, env: ["TERM=xterm-256color", "COLORTERM=truecolor", ...env] }
    );
    session.exec = exec;
    session.stream = stream;
    stream.on("data", (chunk: Buffer) => session.output(chunk));
    const ended = () => void session.ended();
    stream.on("end", ended);
    stream.on("close", ended);
    stream.on("error", ended);
    await exec.resize({ h: rows, w: cols }).catch(() => {});
    return session;
  }

  /** Follows a task's log, from its start, as a read-only view. */
  static async log(container: Docker.Container, task: string, { cols = 120, rows = 30 }: { cols?: number; rows?: number } = {}): Promise<TerminalSession> {
    const session = new TerminalSession(container, newSid("l"), "log", cols, rows, "/workspace", task);
    await session.follow();
    return session;
  }

  private async follow() {
    const { stream } = await execStream(
      this.container,
      ["sh", "-c", 'mkdir -p /tmp/hu/proc && touch "/tmp/hu/proc/$1.log" && exec tail -n +1 -F -s 0.2 "/tmp/hu/proc/$1.log" 2>/dev/null', "sh", this.task!],
      { user: "learner" }
    );
    this.stream = stream;
    // Logs are written without a TTY, so a bare newline needs its carriage return.
    const demux = new Demux((type, data) => {
      if (type === 1) this.output(this.crlf(data));
    });
    stream.on("data", (chunk: Buffer) => demux.push(chunk));
  }

  private crlf(data: Buffer): Buffer {
    const out: number[] = [];
    for (const byte of data) {
      if (byte === 0x0a && this.lastByte !== 0x0d) out.push(0x0d);
      out.push(byte);
      this.lastByte = byte;
    }
    return Buffer.from(out);
  }

  /** Writes a line of the runner's own into the view (a log view's restart marker). */
  note(text: string) {
    this.output(Buffer.from(`\r\n\x1b[2m${text}\x1b[0m\r\n`));
  }

  private output(chunk: Buffer) {
    this.mirror.write(chunk);
    for (const socket of this.sockets) {
      if (socket !== this.writer && socket.buffered > SLOW_BYTES) {
        socket.close(4408, "Too far behind");
        this.sockets.delete(socket);
        continue;
      }
      socket.sendBinary(chunk);
    }
    if (this.writer && this.kind === "shell") {
      this.unacked += chunk.length;
      if (!this.paused && this.unacked > HIGH) {
        this.paused = true;
        this.stream?.pause();
      }
    }
  }

  private async ended() {
    if (this.exited || this.kind !== "shell") return;
    this.exited = { code: null, signal: null };
    const info = await this.exec?.inspect().catch(() => null);
    this.exited.code = info?.ExitCode ?? null;
    for (const socket of this.sockets) socket.sendText({ t: "exit", code: this.exited.code, signal: null });
    this.onExit(this.exited.code);
  }

  /** The serialized screen and scrollback, written once all output so far is in the mirror. */
  private replay(): Promise<string> {
    return new Promise((resolve) => this.mirror.write("", () => resolve(this.serializer.serialize({ scrollback: SCROLLBACK }))));
  }

  /** A socket attaches: ready, the replay, and the writer's size. */
  async attach(socket: TermSocket, cols: number, rows: number) {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.sockets.add(socket);
    const writes = this.kind === "shell" && !this.writer;
    if (writes) this.setWriter(socket);
    socket.sendText({
      t: "ready",
      sid: this.sid,
      cwd: this.cwd,
      shell: this.kind === "shell" ? "bash" : null,
      kind: this.kind,
      task: this.task ?? null,
      readonly: this.writer !== socket,
    });
    const data = await this.replay();
    if (data) socket.sendText({ t: "replay", data });
    if (this.exited) socket.sendText({ t: "exit", code: this.exited.code, signal: this.exited.signal });
    if (writes) this.resize(socket, cols, rows);
  }

  /** A socket went away. The last one starts the grace period. */
  detach(socket: TermSocket, graceMs: number, onExpire: () => void) {
    this.sockets.delete(socket);
    if (this.writer === socket) this.setWriter(null);
    if (this.sockets.size === 0 && this.kind === "shell") {
      this.graceTimer = setTimeout(onExpire, graceMs);
      this.graceTimer.unref();
    }
  }

  private setWriter(socket: TermSocket | null) {
    this.writer = socket;
    this.unacked = 0;
    if (this.paused) {
      this.paused = false;
      this.stream?.resume();
    }
  }

  input(socket: TermSocket, data: Buffer) {
    if (socket !== this.writer || this.kind !== "shell" || this.exited) return;
    this.onInput();
    this.stream?.write(data);
  }

  resize(socket: TermSocket, cols: number, rows: number) {
    if (socket !== this.writer || this.kind !== "shell") return;
    if (!(cols >= 2 && cols <= 1000 && rows >= 1 && rows <= 500)) return;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.mirror.resize(cols, rows);
    void this.exec?.resize({ h: rows, w: cols }).catch(() => {});
  }

  ack(socket: TermSocket, bytes: number) {
    if (socket !== this.writer || !Number.isFinite(bytes) || bytes <= 0) return;
    this.unacked = Math.max(0, this.unacked - bytes);
    if (this.paused && this.unacked < LOW) {
      this.paused = false;
      this.stream?.resume();
    }
  }

  /** The Stop button: Ctrl+C at the prompt, or the signal to a log view's task. */
  signal(socket: TermSocket, sig: string) {
    if (this.kind === "log") return this.onSignal(sig);
    if (socket !== this.writer || this.exited) return;
    this.onInput();
    if (sig === "INT") this.stream?.write("\x03");
    else if (sig === "QUIT") this.stream?.write("\x1c");
    else if (sig === "TSTP") this.stream?.write("\x1a");
  }

  takeover(socket: TermSocket) {
    if (this.kind !== "shell" || !this.sockets.has(socket) || this.writer === socket) return;
    const previous = this.writer;
    this.setWriter(socket);
    previous?.sendText({ t: "mode", readonly: true });
    socket.sendText({ t: "mode", readonly: false });
  }

  /** Ends the session: the shell and everything it started, or the log view's tail. */
  async kill() {
    if (this.killed) return;
    this.killed = true;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    for (const socket of this.sockets) socket.close(4404, "The terminal ended");
    this.sockets.clear();
    if (this.kind === "shell" && !this.exited) {
      await execCollect(
        this.container,
        [
          "sh",
          "-c",
          'p=$(cat "/tmp/hu/term/$1.pid" 2>/dev/null) && [ -n "$p" ] && { pkill -HUP -s "$p"; sleep 0.3; pkill -KILL -s "$p"; }; rm -f "/tmp/hu/term/$1.pid"; exit 0',
          "sh",
          this.sid,
        ],
        { user: "learner", timeoutMs: 5_000 }
      ).catch(() => {});
    }
    this.stream?.destroy();
    this.mirror.dispose();
  }

  /** The container stopped: say so and end without exec'ing anything. */
  close(message: string) {
    if (this.killed) return;
    this.killed = true;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    for (const socket of this.sockets) {
      if (this.kind === "shell" && !this.exited) socket.sendText({ t: "exit", code: null, signal: null, message });
      socket.close(4404, "The terminal ended");
    }
    this.sockets.clear();
    this.stream?.destroy();
    this.mirror.dispose();
  }
}
