// The connection: one pg Pool for the whole process, wrapped by Drizzle. Outside production it
// also counts the queries each request runs, which is how N+1 patterns show up (X-Query-Count).
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";
import type { Db } from "./tx.ts";

export type QueryTally = { count: number };

export type QueryCounter = {
  /** Runs fn so that every Drizzle query inside it, however deep in the call stack, adds 1 to tally. */
  track<T>(tally: QueryTally, fn: () => T): T;
};

export type Database = { db: Db; pool: Pool; queries: QueryCounter };

export type DbOptions = {
  maxConnections?: number;
  statementTimeoutMs?: number;
  onPoolError?: (err: Error) => void;
};

export function createDb(url: string, options: DbOptions = {}): Database {
  const pool = new Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    application_name: "stagepass-api",
    // Sent when each connection opens: PostgreSQL cancels any statement running longer.
    options: `-c statement_timeout=${options.statementTimeoutMs ?? 15_000}`,
  });
  // An idle connection can fail (a database restart). Without a listener that would crash the process.
  pool.on("error", (err) => options.onPoolError?.(err));

  const tallies = new AsyncLocalStorage<QueryTally>();
  const db = drizzle({
    client: pool,
    schema,
    logger: {
      logQuery() {
        const tally = tallies.getStore();
        if (tally !== undefined) tally.count += 1;
      },
    },
  });
  return { db, pool, queries: { track: (tally, fn) => tallies.run(tally, fn) } };
}

/** SELECT 1 within timeoutMs, for the readiness check. */
export async function ping(pool: Pool, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database did not answer within ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([pool.query("SELECT 1"), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
