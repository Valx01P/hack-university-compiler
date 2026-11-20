import { execFile, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { IPty } from "node-pty";

const require = createRequire(import.meta.url);

let ptyModule: typeof import("node-pty") | null = null;

/** node-pty, loaded on the first host shell, so a runner that never opens
    one never loads it. Installs skip packages' scripts (npm run up uses
    --ignore-scripts), and node-pty's would have made its prebuilt
    spawn-helper executable, so on a Mac that's done here: without it, every
    spawn fails with "posix_spawnp failed". */
export function loadPty(): typeof import("node-pty") {
  if (ptyModule) return ptyModule;
  if (process.platform !== "win32") {
    const root = path.dirname(require.resolve("node-pty/package.json"));
    const helper = path.join(root, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
    try {
      if ((fs.statSync(helper).mode & 0o111) === 0) fs.chmodSync(helper, 0o755);
    } catch {
      /* no prebuild for this machine: node-pty built its own */
    }
  }
  ptyModule = require("node-pty") as typeof import("node-pty");
  return ptyModule;
}

/** ps's output, at once (for runner/host-shell.ts's end, which can't wait on
    the event loop) or not (the runner's, which mustn't block it). */
const psNow = (args: string[]) => spawnSync("ps", args, { encoding: "utf8", timeout: 5_000 }).stdout ?? "";
const ps = (args: string[]) => new Promise<string>((resolve) => execFile("ps", args, { timeout: 5_000 }, (_err, out) => resolve(String(out ?? ""))));

/** A terminal's name in ps's `tty` column (ttys012, pts/3), or null. */
function terminalName(out: string): string | null {
  const name = out.trim();
  return /^[\w/]+$/.test(name) && !/^\?+$/.test(name) ? name : null;
}

/** Every process with `tty` as its terminal, from `ps -A -o pid=,tty=`
    (pkill -t matches none of them on macOS, and its pkill can't take a
    session either). */
function processesOn(tty: string, out: string): number[] {
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([, t]) => t === tty)
    .map(([p]) => Number(p))
    .filter((p) => Number.isInteger(p) && p > 1 && p !== process.pid);
}

const signal = (pids: number[], sig: NodeJS.Signals) => {
  for (const pid of pids) {
    try {
      process.kill(pid, sig);
    } catch {
      /* already gone */
    }
  }
};

/** Ends `pid` and everything on its terminal at once (its jobs too, in the
    background or not): a hangup now, and a kill a moment later to whatever
    is left, from a detached sh, so it happens even if the caller is gone by
    then (runner/host-shell.ts ends itself right after). */
export function hangUpTerminal(pid: number): void {
  const tty = terminalName(psNow(["-o", "tty=", "-p", String(pid)]));
  const pids = tty ? processesOn(tty, psNow(["-A", "-o", "pid=,tty="])) : [];
  signal(pids.length ? pids : [pid], "SIGHUP");
  if (process.platform === "win32" || !pids.length) return;
  spawn("sh", ["-c", `sleep 0.3; kill -KILL ${pids.join(" ")} 2>/dev/null`], { detached: true, stdio: "ignore" }).unref();
}

/** Ends a host shell and what it started: a hangup to everything on its
    terminal (its jobs too, in the background or not), then a kill to what's
    left. On a tmux client's pty that's only the client: tmux's server, and
    the shell in it, have terminals of their own. Windows has no sessions:
    closing the pseudo-console ends what's in it. */
export async function killHostShell(pty: IPty): Promise<void> {
  if (process.platform === "win32") {
    try {
      pty.kill();
    } catch {
      /* already gone */
    }
    return;
  }
  const tty = terminalName(await ps(["-o", "tty=", "-p", String(pty.pid)]));
  const on = async () => (tty ? processesOn(tty, await ps(["-A", "-o", "pid=,tty="])) : [pty.pid]);
  signal(await on(), "SIGHUP");
  await new Promise((r) => setTimeout(r, 300));
  signal(await on(), "SIGKILL");
}

/** Variables an AI agent's session sets for what it starts (Claude Code's:
    CLAUDECODE, its session id, messaging socket and token, IDE port, effort,
    "child session" marker), which aren't the user's. Inherited by a shell
    in the Terminal (the app started from inside a Claude Code session),
    they'd make the Claude Code you run there take itself for that
    session's child: no transcript saved, its effort and mode. Your own
    settings (ANTHROPIC_*, CLAUDE_CODE_USE_BEDROCK and the like) stay. */
const AGENT_SESSION = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|AI_AGENT)$|^CLAUDE_CODE_(ENTRYPOINT|EXECPATH|SSE_PORT|SESSION_\w+|CHILD_\w+|MESSAGING_\w+)$/;

/** `env` without an agent's session markers (above). */
export function withoutAgentSession(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (value !== undefined && !AGENT_SESSION.test(key)) out[key] = value;
  return out;
}
