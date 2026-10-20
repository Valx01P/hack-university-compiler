// The database types every layer shares, and transactions. withTx runs a function inside
// BEGIN ... COMMIT on one pooled connection, and retries it when PostgreSQL aborted it for a
// deadlock or a serialization failure: nothing was committed, so running it again is safe.
import { setTimeout as sleep } from "node:timers/promises";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
// Repository methods take either, so the same query can run alone or inside a transaction.
export type DbOrTx = Db | Tx;

// serialization_failure and deadlock_detected: PostgreSQL rolled back, and trying again works.
const RETRYABLE = new Set(["40001", "40P01"]);

/** The SQLSTATE of a PostgreSQL error. Drizzle wraps driver errors, so the code may be on err.cause. */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

/** The constraint a PostgreSQL error names (23505, 23503, 23514), also through err.cause. */
export function pgConstraint(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const constraint = (current as { constraint?: unknown }).constraint;
    if (typeof constraint === "string") return constraint;
    current = current.cause;
  }
  return undefined;
}

export type WithTxOptions = {
  /** How many times to run fn in all before giving up. */
  maxAttempts?: number;
  /** The first pause between attempts. Each later pause doubles, with jitter. */
  backoffMs?: number;
};

export async function withTx<T>(
  db: Pick<Db, "transaction">,
  fn: (tx: Tx) => Promise<T>,
  { maxAttempts = 3, backoffMs = 20 }: WithTxOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(fn);
    } catch (err) {
      const code = pgErrorCode(err);
      if (code === undefined || !RETRYABLE.has(code) || attempt >= maxAttempts) throw err;
      // Random jitter, so the two transactions that collided do not collide again in lockstep.
      await sleep(backoffMs * 2 ** (attempt - 1) * (0.5 + Math.random()));
    }
  }
}

export type RaceWindow = (name: string) => Promise<void>;

/**
 * A pause between a read and the write that depends on it, only when HU_RACE_DELAY_MS is set.
 * Concurrency checks set it so read-then-write code loses its race every time instead of
 * sometimes. Correct code (an atomic update or a row lock) gives the same result either way.
 */
export function raceWindow(delayMs: number): RaceWindow {
  if (delayMs <= 0) return async () => {};
  return async () => {
    await sleep(delayMs);
  };
}
