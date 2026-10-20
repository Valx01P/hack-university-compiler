import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Everything the runner takes from its environment, read once at startup.
 * `npm run up` and `npm run dev` set these, and the defaults are what they set.
 */
export interface Config {
  /** Where the runner listens, on 127.0.0.1 only (HU_RUNNER_PORT). */
  port: number;
  /** The app's port (PORT), for the WebSocket Origin rule. */
  appPort: number;
  /** ~/.hack-university (HU_DATA_DIR), resolved with realpath so no symlink sits in it. */
  dataDir: string;
  /** "live" for learners, "verify" for the verifiers (HU_NS): each runner acts only on its own. */
  ns: Namespace;
  /** Jobs that run at once (HU_JOB_SLOTS). The rest wait in a FIFO queue. */
  jobSlots: number;
  /** How long a WebSocket ticket lives (HU_TICKET_TTL_MS). */
  ticketTtlMs: number;
  /** How long a new socket has to send its ticket (HU_WS_HELLO_MS). */
  helloTimeoutMs: number;
  /** How often the runner checks on Docker and reaps leftovers (HU_POLL_MS). */
  pollMs: number;
  /** The repository, for docker/ (the image sources). */
  root: string;
  /** Where template layers and check suites are read from (HU_CONTENT_DIR), resolved with realpath. */
  contentDir: string;
  /** The workspace port range (HU_WS_PORTS, or HU_PORT_RANGE). */
  wsPorts: { first: number; last: number };
  /** A running workspace stops after this long without activity (HU_IDLE_MS). */
  idleMs: number;
  /** A stopped workspace's container is removed after this long (HU_WS_REMOVE_MS). */
  wsRemoveMs: number;
  /** How long a terminal with no socket lives (HU_TERM_GRACE_MS). */
  termGraceMs: number;
  /** How often a running workspace is read for ports, task exits, and limits (HU_WS_POLL_MS). */
  wsPollMs: number;
  /** Replaces the memory budget, in MiB (HU_MEM_BUDGET_MB), or null to work it out from Docker. */
  memBudgetMb: number | null;
}

export type Namespace = "live" | "verify";

export const ROOT = path.resolve(import.meta.dirname, "..");

function int(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive whole number, not "${value}".`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ns = env.HU_NS ?? "live";
  if (ns !== "live" && ns !== "verify") throw new Error(`HU_NS must be live or verify, not "${ns}".`);
  return {
    port: int(env.HU_RUNNER_PORT, 3100, "HU_RUNNER_PORT"),
    appPort: int(env.PORT, 3000, "PORT"),
    dataDir: dataDir(env),
    ns,
    jobSlots: int(env.HU_JOB_SLOTS, 4, "HU_JOB_SLOTS"),
    ticketTtlMs: int(env.HU_TICKET_TTL_MS, 30_000, "HU_TICKET_TTL_MS"),
    helloTimeoutMs: int(env.HU_WS_HELLO_MS, 5_000, "HU_WS_HELLO_MS"),
    pollMs: int(env.HU_POLL_MS, 5_000, "HU_POLL_MS"),
    root: ROOT,
    contentDir: realDir(env.HU_CONTENT_DIR || path.join(ROOT, "content")),
    wsPorts: range(env.HU_WS_PORTS || env.HU_PORT_RANGE, { first: 23_000, last: 29_999 }, "HU_WS_PORTS"),
    idleMs: int(env.HU_IDLE_MS, 20 * 60_000, "HU_IDLE_MS"),
    wsRemoveMs: int(env.HU_WS_REMOVE_MS, 24 * 3_600_000, "HU_WS_REMOVE_MS"),
    termGraceMs: int(env.HU_TERM_GRACE_MS, 10 * 60_000, "HU_TERM_GRACE_MS"),
    wsPollMs: int(env.HU_WS_POLL_MS, 1_000, "HU_WS_POLL_MS"),
    memBudgetMb: env.HU_MEM_BUDGET_MB ? int(env.HU_MEM_BUDGET_MB, 0, "HU_MEM_BUDGET_MB") : null,
  };
}

/** A port range written "23000-29999". */
function range(value: string | undefined, fallback: { first: number; last: number }, name: string): { first: number; last: number } {
  if (!value) return fallback;
  const match = /^(\d{1,5})-(\d{1,5})$/.exec(value.trim());
  const first = Number(match?.[1]);
  const last = Number(match?.[2]);
  if (!match || first < 1024 || last > 65535 || first > last) throw new Error(`${name} must look like 23000-29999, not "${value}".`);
  return { first, last };
}

/** A folder resolved with realpath, or the path as given when it doesn't exist (yet). */
function realDir(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

/** The data directory, created 0700 when missing and resolved once, so no
    symlink sits anywhere in its path. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.HU_DATA_DIR || path.join(homedir(), ".hack-university");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return realpathSync(dir);
}
