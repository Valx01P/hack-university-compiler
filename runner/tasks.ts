import type Docker from "dockerode";
import { execCollect, execDetached } from "./exec.ts";
import { signalName } from "./jobs.ts";

/**
 * Tasks (architecture §4.2.4): the commands a template names (`dev`, `test`,
 * `start`, …), the only ones Run, Stop, and the Server tab can start. Each
 * runs detached in its own session,
 *
 *   setsid sh -c 'echo $$ > /tmp/hu/proc/<name>.pid; exec > <name>.log 2>&1;
 *                 eval "<cmd>"; echo $? > <name>.exit'
 *
 * so it outlives a dropped socket, a reload, and a runner restart (the runner
 * finds it again by its pid file). Stop sends TERM to its process group and
 * KILL 5 s later, because the Engine API can't kill an exec. The wrapper
 * catches the signals with a handler (never ignores them, which children would
 * inherit) so it lives to write the exit status, and runs the command with
 * eval rather than another sh, whose own death by TERM would hide the exit
 * status of a server that shuts down cleanly.
 *
 * Once a second, the workspace's poll reads every task's pid, whether it's
 * alive, and its exit status, with the listening ports and the cgroup's
 * memory and limit counters, in one exec (`pollScript`).
 */

const LAUNCH = [
  'mkdir -p /tmp/hu/proc && cd "$3" 2>/dev/null; exec setsid sh -c \'',
  'echo $$ > "/tmp/hu/proc/$1.pid"',
  'exec > "/tmp/hu/proc/$1.log" 2>&1 < /dev/null',
  "trap : INT TERM HUP QUIT",
  'eval "$2"',
  'echo $? > "/tmp/hu/proc/$1.exit"',
  "' sh \"$1\" \"$2\"",
].join("\n");

const SIGNAL = 'p=$(cat "/tmp/hu/proc/$2.pid" 2>/dev/null) && [ -n "$p" ] && kill -s "$1" -- "-$p" 2>/dev/null; exit 0';

/** One exec a second: ports, memory and limits, and each task's state. */
export const POLL = [
  "echo NET",
  "cat /proc/net/tcp /proc/net/tcp6 2>/dev/null",
  "echo MEM",
  "cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.max 2>/dev/null",
  "grep -h -e '^oom_kill ' /sys/fs/cgroup/memory.events 2>/dev/null",
  "grep -h -e '^max ' /sys/fs/cgroup/pids.events 2>/dev/null",
  "echo PROC",
  'for f in /tmp/hu/proc/*.pid; do [ -f "$f" ] || continue; n=${f##*/}; n=${n%.pid}; p=$(cat "$f"); a=0; kill -0 "$p" 2>/dev/null && a=1; e=$(cat "/tmp/hu/proc/$n.exit" 2>/dev/null); echo "$n $p $a $e"; done',
  "exit 0",
].join("\n");

export interface Listening {
  port: number;
  bind: string;
  inode: string;
}

export interface PollResult {
  listening: Map<number, Listening>;
  memUsed: number | null;
  memMax: number | null;
  oomKills: number;
  pidsMax: number;
  procs: Map<string, { pid: number; alive: boolean; exit: number | null }>;
}

function hexIp(hex: string): string {
  if (hex.length === 8) {
    const n = parseInt(hex, 16);
    return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255].join(".");
  }
  if (/^0{32}$/.test(hex)) return "::";
  if (hex === "00000000000000000000000001000000") return "::1";
  if (hex.startsWith("0000000000000000FFFF0000")) return hexIp(hex.slice(24));
  return hex;
}

/** Where Docker's embedded DNS server listens inside a container on a user-defined network. */
const DOCKER_DNS = "127.0.0.11";

export function parsePoll(text: string): PollResult {
  const result: PollResult = { listening: new Map(), memUsed: null, memMax: null, oomKills: 0, pidsMax: 0, procs: new Map() };
  let section = "";
  const mem: string[] = [];
  for (const line of text.split("\n")) {
    if (line === "NET" || line === "MEM" || line === "PROC") {
      section = line;
      continue;
    }
    const f = line.trim().split(/\s+/);
    if (section === "NET") {
      // sl local_address rem_address st … inode: LISTEN is 0A.
      if (f.length < 10 || f[3] !== "0A" || !f[1].includes(":")) continue;
      const [ip, portHex] = f[1].split(":");
      const port = parseInt(portHex, 16);
      const bind = hexIp(ip);
      // Docker's own DNS on a user-defined network (the database network's
      // `db` and `mongo` names) listens on 127.0.0.11, no server of the learner's.
      if (bind === DOCKER_DNS) continue;
      const known = result.listening.get(port);
      // 0.0.0.0 or :: says more than a loopback bind on the same port.
      if (!known || bind === "0.0.0.0" || bind === "::") result.listening.set(port, { port, bind, inode: f[9] });
    } else if (section === "MEM") {
      if (f[0] === "oom_kill") result.oomKills = Number(f[1]) || 0;
      else if (f[0] === "max" && f.length === 2) result.pidsMax = Number(f[1]) || 0;
      else if (f[0]) mem.push(f[0]);
    } else if (section === "PROC" && f.length >= 3) {
      result.procs.set(f[0], { pid: Number(f[1]), alive: f[2] === "1", exit: f[3] !== undefined && f[3] !== "" ? Number(f[3]) : null });
    }
  }
  if (mem[0] && /^\d+$/.test(mem[0])) result.memUsed = Number(mem[0]);
  if (mem[1] && /^\d+$/.test(mem[1])) result.memMax = Number(mem[1]);
  return result;
}

export interface TaskDef {
  cmd: string;
  label?: string;
  run?: boolean;
}

export type TaskStateName = "idle" | "starting" | "running" | "exited";

export interface TaskState {
  name: string;
  label: string;
  cmd: string;
  state: TaskStateName;
  code: number | null;
  signal: string | null;
  startedAt: number | null;
  sid: string | null;
}

/** Starts a task's wrapper in `workDir`, after clearing its last run's files. */
export async function launchTask(container: Docker.Container, name: string, cmd: string, env: string[], workDir = "/workspace"): Promise<void> {
  await execCollect(container, ["sh", "-c", 'mkdir -p /tmp/hu/proc && rm -f "/tmp/hu/proc/$1.pid" "/tmp/hu/proc/$1.exit"', "sh", name], {
    user: "learner",
    timeoutMs: 10_000,
  });
  await execDetached(container, ["sh", "-c", LAUNCH, "sh", name, cmd, workDir], {
    user: "learner",
    workDir,
    env: ["FORCE_COLOR=1", "PY_COLORS=1", "CLICOLOR_FORCE=1", ...env],
  });
}

/** Sends a signal ("TERM", "INT", "KILL", …) to a task's whole process group. */
export async function signalTask(container: Docker.Container, name: string, sig: string): Promise<void> {
  await execCollect(container, ["sh", "-c", SIGNAL, "sh", sig, name], { user: "learner", timeoutMs: 5_000 });
}

/** How a task ended, from its exit status: 128 + N reads as signal N. */
export function ending(exit: number | null, sentKill: boolean): { code: number | null; signal: string | null } {
  if (exit === null) return { code: null, signal: sentKill ? "SIGKILL" : null };
  if (exit > 128 && exit < 160) return { code: null, signal: signalName(exit - 128) };
  return { code: exit, signal: null };
}

/** Finds the process that owns a listening socket, by its inode. */
export async function processOf(container: Docker.Container, inode: string): Promise<string | null> {
  if (!/^\d+$/.test(inode)) return null;
  const result = await execCollect(
    container,
    [
      "sh",
      "-c",
      'f=$(find /proc/[0-9]*/fd -maxdepth 1 -lname "socket:\\[$1\\]" -print -quit 2>/dev/null); [ -n "$f" ] || exit 0; p=${f#/proc/}; cat "/proc/${p%%/*}/comm" 2>/dev/null; exit 0',
      "sh",
      inode,
    ],
    { user: "learner", timeoutMs: 5_000 }
  ).catch(() => null);
  // Node names its main thread "node-MainThread".
  const name = result?.stdout.toString("utf8").trim().replace(/-MainThread$/, "");
  return name || null;
}
