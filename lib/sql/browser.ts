import type { SqlRun } from "@/lib/sql/core.mjs";
import type { SqlOp } from "@/lib/sql/worker";

/**
 * SQL in the browser: PostgreSQL compiled to WebAssembly (PGlite), in a Web
 * Worker (lib/sql/worker.ts) started the first time something runs SQL. A
 * query PGlite runs never yields, so no timer inside it can stop one that
 * never ends, and on the page it would freeze the tab. In the worker, the page
 * stays free, and a run that passes the time limit ends the worker: the run
 * reports that it timed out, and the next one starts a fresh worker (the
 * playground starting over from the sample data). Lessons and challenges get a
 * brand-new database for every run, the playground keeps one for the visit.
 */

/** A run's time limit: the sandbox's 10 seconds for a program, and a few more
    for loading PostgreSQL the first time. */
const TIME_LIMIT_MS = 15_000;

export const SQL_TIMED_OUT =
  "Timed out. The query ran too long (usually a recursive query that never stops, or a join that makes far too many rows), so it was stopped.";
const SQL_CRASHED = "PostgreSQL stopped unexpectedly, most likely out of memory.";
const PLAYGROUND_RESET = " The playground's database starts over from the sample data.";

/** Why a request didn't finish: the worker was stopped (timed out) or died. */
class SqlStopped extends Error {}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

/** Ends the worker and every request waiting on it. */
function stop(reason: Error) {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(reason);
  }
  pending.clear();
}

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: unknown; message?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    clearTimeout(p.timer);
    if (e.data.ok) p.resolve(e.data.value);
    else p.reject(new Error(e.data.message));
  };
  w.onerror = (e) => {
    e.preventDefault();
    stop(new SqlStopped(SQL_CRASHED));
  };
  worker = w;
  return w;
}

function call<T>(op: SqlOp, ...args: unknown[]): Promise<T> {
  const w = started();
  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => stop(new SqlStopped(SQL_TIMED_OUT)), TIME_LIMIT_MS);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    w.postMessage({ id, op, args });
  });
}

/** Runs a script on a fresh database after its setup, and reports it like a
    program run: psql's output on stdout, the error (if any) on stderr. */
export async function runSqlScript(code: string, setup: string): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  try {
    return await call("runSqlScript", code, setup);
  } catch (err) {
    if (err instanceof SqlStopped) return { stdout: "", stderr: err.message, failed: true };
    throw err;
  }
}

/** Runs a script on the playground database. */
export async function runPlayground(code: string): Promise<SqlRun> {
  try {
    return await call("runPlayground", code);
  } catch (err) {
    if (err instanceof SqlStopped) return { results: [], error: { statement: "", message: err.message + PLAYGROUND_RESET } };
    throw err;
  }
}

/** Puts the playground back to the sample data. */
export async function resetPlayground(): Promise<void> {
  await call("resetPlayground");
}

export interface TableInfo {
  name: string;
  kind: "table" | "view" | "materialized view";
  rows: number | null;
  columns: { name: string; type: string; nullable: boolean; key: boolean }[];
}

/** The playground's tables, views, and materialized views, with their columns,
    primary keys, and row counts. */
export function describePlayground(): Promise<TableInfo[]> {
  return call("describePlayground");
}

/** The first rows of one playground table or view. */
export function previewTable(name: string, limit = 50): Promise<SqlRun> {
  return call("previewTable", name, limit);
}
