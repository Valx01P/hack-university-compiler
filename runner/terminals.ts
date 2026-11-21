import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Duplex } from "node:stream";
import serializeAddon from "@xterm/addon-serialize";
import headless from "@xterm/headless";
import type Docker from "dockerode";
import type { IPty } from "node-pty";
import { dropBlankTop, mayBlank } from "./blank-top.ts";
import { execCollect, execStream } from "./exec.ts";
import { tmuxClient, tmuxPath } from "./host-tmux.ts";
import { Demux } from "./jobs.ts";
import { killHostShell, loadPty, withoutAgentSession } from "./pty.ts";

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
 * - A host shell (TerminalSession.host) is the same session around a shell on
 *   this computer instead, through a pseudo-terminal (node-pty): the
 *   compiler's Terminal, in its workspace's folder. It's outside the sandbox
 *   on purpose (your own tools, like Claude Code, with your own login), so
 *   only a workspace whose template asks for it gets one. With tmux there,
 *   the pty runs a tmux client and the shell lives in tmux, so ending the
 *   session (the page gone, the runner stopping) leaves the shell running
 *   for the next one to attach to (runner/host-tmux.ts).
 */

/** The process behind a shell: a docker exec stream, or a pty on this computer. */
interface ShellProcess {
  write(data: Buffer | string): void;
  pause(): void;
  resume(): void;
  resize(cols: number, rows: number): void;
  /** Ends the shell and everything it started. */
  kill(): Promise<void>;
  /** Lets go of it (its container already stopped, or it was killed). */
  destroy(): void;
}

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

  private readonly container: Docker.Container | null;
  private readonly mirror: InstanceType<typeof Terminal>;
  private readonly serializer: InstanceType<typeof SerializeAddon>;
  private readonly sockets = new Set<TermSocket>();
  private writer: TermSocket | null = null;
  /** A shell's process. */
  private proc: ShellProcess | null = null;
  /** What the ready message names: bash in a container, the host's own shell. */
  private shellName = "bash";
  /** A log view's tail. */
  private stream: Duplex | null = null;
  private unacked = 0;
  private paused = false;
  private lastByte = 0;
  private graceTimer: NodeJS.Timeout | null = null;
  private killed = false;

  private constructor(container: Docker.Container | null, sid: string, kind: TermKind, cols: number, rows: number, cwd: string, task?: string) {
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
    session.proc = {
      write: (data) => void stream.write(data),
      pause: () => void stream.pause(),
      resume: () => void stream.resume(),
      resize: (w, h) => void exec.resize({ h, w }).catch(() => {}),
      kill: async () => {
        await execCollect(
          container,
          [
            "sh",
            "-c",
            'p=$(cat "/tmp/hu/term/$1.pid" 2>/dev/null) && [ -n "$p" ] && { pkill -HUP -s "$p"; sleep 0.3; pkill -KILL -s "$p"; }; rm -f "/tmp/hu/term/$1.pid"; exit 0',
            "sh",
            session.sid,
          ],
          { user: "learner", timeoutMs: 5_000 }
        ).catch(() => {});
      },
      destroy: () => void stream.destroy(),
    };
    stream.on("data", (chunk: Buffer) => session.output(chunk));
    const ended = () => void session.ended(async () => (await exec.inspect()).ExitCode ?? null);
    stream.on("end", ended);
    stream.on("close", ended);
    stream.on("error", ended);
    await exec.resize({ h: rows, w: cols }).catch(() => {});
    return session;
  }

  /** Your own login shell on this computer, with a pty, in `cwd` (a
      host-stored workspace's folder). It starts when the first terminal
      attaches, at that terminal's size: a shell started at a guessed size
      draws its first prompt for that width, and a narrower terminal wraps
      it, leaving blank lines above the prompt. `tmux` names the tmux
      session it's kept in, when tmux is there. */
  static host({ cols, rows, cwd, tmux: tmuxName }: { cols: number; rows: number; cwd: string; tmux?: string }): TerminalSession {
    const { spawn } = loadPty();
    const session = new TerminalSession(null, newSid("h"), "shell", cols, rows, cwd);
    const windows = process.platform === "win32";
    // Windows: PowerShell, there on every Windows 10 and 11. Elsewhere your
    // login shell, interactive, so it reads your profile like a new terminal
    // window does (PATH, and tools installed there, like Claude Code).
    const file = windows ? "powershell.exe" : process.env.SHELL || "/bin/bash";
    session.shellName = path.basename(file).replace(/\.exe$/i, "");
    const tmux = tmuxName ? tmuxPath() : null;
    session.inTmux = Boolean(tmux);
    const command = tmux && tmuxName ? tmuxClient(tmux, tmuxName, cwd, file) : { file, args: windows ? ["-NoLogo"] : ["-l"] };
    session.startHost = (w, h) => {
      let pty: IPty;
      try {
        pty = spawn(command.file, command.args, { name: "xterm-256color", cols: w, rows: h, cwd, env: hostShellEnv() });
      } catch (err) {
        session.note(`Couldn't start ${session.shellName}: ${(err as Error).message}`);
        void session.ended(async () => null);
        return;
      }
      session.startedProc(pty);
    };
    return session;
  }

  /** Starts the waiting host shell, at the first terminal's size. */
  private startHost: ((cols: number, rows: number) => void) | null = null;
  /** The shell is in tmux: ending this session only detaches from it. */
  inTmux = false;

  private startedProc(pty: IPty) {
    const session = this;
    session.proc = {
      write: (data) => pty.write(typeof data === "string" ? data : data.toString("utf8")),
      pause: () => pty.pause(),
      resume: () => pty.resume(),
      resize: (w, h) => {
        try {
          pty.resize(w, h);
        } catch {
          /* it just exited */
        }
      },
      kill: () => killHostShell(pty),
      destroy: () => {
        try {
          pty.kill();
        } catch {
          /* already gone */
        }
      },
    };
    pty.onData((data) => {
      session.hostOutput = session.hostOutput.then(() => session.shown(data)).catch(() => {});
    });
    pty.onExit(({ exitCode }) => void session.hostOutput.then(() => session.ended(async () => exitCode)));
  }

  /** The host shell's output so far, in order (dropBlankTop is async). */
  private hostOutput: Promise<void> = Promise.resolve();

  /** A host shell's output, shown, minus a line feed that would leave a
      blank first line on an empty screen (runner/blank-top.ts). In tmux,
      tmux draws the screen and runner/host-shell.ts does that, inside. */
  private async shown(data: string) {
    if (this.inTmux || !mayBlank(this.mirror, data)) return this.output(Buffer.from(data, "utf8"));
    this.send(Buffer.from(await dropBlankTop(this.mirror, data), "utf8"));
  }

  /** Follows a task's log, from its start, as a read-only view. */
  static async log(container: Docker.Container, task: string, { cols = 120, rows = 30 }: { cols?: number; rows?: number } = {}): Promise<TerminalSession> {
    const session = new TerminalSession(container, newSid("l"), "log", cols, rows, "/workspace", task);
    await session.follow();
    return session;
  }

  private async follow() {
    const { stream } = await execStream(
      // A log view is always a container's (TerminalSession.log).
      this.container!,
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
    this.send(chunk);
  }

  /** Output that's in the mirror already, to the sockets, with flow control. */
  private send(chunk: Buffer) {
    if (!chunk.length) return;
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
        this.proc?.pause();
      }
    }
  }

  private async ended(exitCode: () => Promise<number | null>) {
    if (this.exited || this.kind !== "shell") return;
    // The runner let go of a tmux client (kill, below): the shell runs on in
    // tmux, so nothing says it exited, and the page attaches to it again.
    if (this.killed && this.inTmux) return;
    this.exited = { code: null, signal: null };
    this.exited.code = await exitCode().catch(() => null);
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
    if (this.startHost) {
      const start = this.startHost;
      this.startHost = null;
      if (cols >= 2 && cols <= 1000 && rows >= 1 && rows <= 500) {
        this.cols = cols;
        this.rows = rows;
        this.mirror.resize(cols, rows);
      }
      start(this.cols, this.rows);
    }
    this.sockets.add(socket);
    const writes = this.kind === "shell" && !this.writer;
    if (writes) this.setWriter(socket);
    socket.sendText({
      t: "ready",
      sid: this.sid,
      cwd: this.cwd,
      shell: this.kind === "shell" ? this.shellName : null,
      kind: this.kind,
      task: this.task ?? null,
      readonly: this.writer !== socket,
      // tmux reads the terminal's light or dark (terminal-view.tsx).
      tmux: this.inTmux,
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
      this.proc?.resume();
    }
  }

  input(socket: TermSocket, data: Buffer) {
    if (socket !== this.writer || this.kind !== "shell" || this.exited) return;
    this.onInput();
    this.proc?.write(data);
  }

  resize(socket: TermSocket, cols: number, rows: number) {
    if (socket !== this.writer || this.kind !== "shell") return;
    if (!(cols >= 2 && cols <= 1000 && rows >= 1 && rows <= 500)) return;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.mirror.resize(cols, rows);
    this.proc?.resize(cols, rows);
  }

  ack(socket: TermSocket, bytes: number) {
    if (socket !== this.writer || !Number.isFinite(bytes) || bytes <= 0) return;
    this.unacked = Math.max(0, this.unacked - bytes);
    if (this.paused && this.unacked < LOW) {
      this.paused = false;
      this.proc?.resume();
    }
  }

  /** The Stop button: Ctrl+C at the prompt, or the signal to a log view's task. */
  signal(socket: TermSocket, sig: string) {
    if (this.kind === "log") return this.onSignal(sig);
    if (socket !== this.writer || this.exited) return;
    this.onInput();
    if (sig === "INT") this.proc?.write("\x03");
    else if (sig === "QUIT") this.proc?.write("\x1c");
    else if (sig === "TSTP") this.proc?.write("\x1a");
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
    this.startHost = null;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    for (const socket of this.sockets) socket.close(4404, "The terminal ended");
    this.sockets.clear();
    if (this.kind === "shell" && !this.exited) await this.proc?.kill();
    this.proc?.destroy();
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
    this.proc?.destroy();
    this.stream?.destroy();
    this.mirror.dispose();
  }
}

/** The runner's own environment for a host shell, minus what's the app's:
    the runner's token and settings (HU_*), npm's run variables, and the
    app's port, so nothing in the shell can reach the runner as the app, and
    an npm run dev there doesn't take the app's port. And minus an AI agent's
    session markers, the app started from inside one (runner/pty.ts). */
export function hostShellEnv(from: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(withoutAgentSession(from))) {
    if (value === undefined) continue;
    if (/^(HU_|npm_|NEXT_|__NEXT|TURBOPACK)/i.test(key) || ["PORT", "NODE_OPTIONS", "INIT_CWD", "NODE_ENV"].includes(key.toUpperCase())) continue;
    env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}
