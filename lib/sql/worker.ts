import type { PGlite } from "@electric-sql/pglite";
import { formatError, formatRun, prepareDatabase, runSql, type SqlRun } from "@/lib/sql/core.mjs";
import type { TableInfo } from "@/lib/sql/browser";
import { SAMPLE_DB_SQL } from "@/lib/sql/sample-db";

/**
 * PostgreSQL compiled to WebAssembly (PGlite), in a Web Worker of its own, so
 * a query that never ends (a recursive CTE with no stop, a join that makes
 * billions of rows) can't freeze the page: PGlite runs a query start to finish
 * without yielding (statement_timeout never fires), so lib/sql/browser.ts
 * stops the whole worker at its time limit instead. Lessons and challenges get
 * a brand-new database for every run, loaded with their setup. The compiler's
 * playground keeps one database for as long as the worker lives, starting from
 * the sample data, so you can watch your changes pile up (and reset it).
 */

/** The rows a result keeps for the page, so a huge one can't freeze it when
    it's drawn. The full count travels along as `total`. */
const MAX_ROWS = 1000;

function capRows(run: SqlRun): SqlRun {
  return {
    ...run,
    results: run.results.map((r) =>
      r.kind === "rows" && r.rows.length > MAX_ROWS ? { ...r, rows: r.rows.slice(0, MAX_ROWS), total: r.rows.length } : r
    ),
  };
}

let pglite: Promise<typeof import("@electric-sql/pglite")> | null = null;

async function newDatabase(): Promise<PGlite> {
  pglite ??= import("@electric-sql/pglite");
  const { PGlite } = await pglite;
  return prepareDatabase(new PGlite());
}

async function runSqlScript(code: string, setup: string): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  const db = await newDatabase();
  try {
    if (setup.trim()) {
      const prepared = await runSql(db, setup);
      if (prepared.error) return { stdout: "", stderr: `The setup failed. ${formatError(prepared.error)}`, failed: true };
    }
    const run = capRows(await runSql(db, code));
    return { stdout: formatRun(run), stderr: run.error ? formatError(run.error) : "", failed: Boolean(run.error) };
  } finally {
    await db.close();
  }
}

let playground: Promise<PGlite> | null = null;

function playgroundDb(): Promise<PGlite> {
  playground ??= newDatabase().then(async (db) => {
    await db.exec(SAMPLE_DB_SQL);
    return db;
  });
  return playground;
}

async function runPlayground(code: string): Promise<SqlRun> {
  return capRows(await runSql(await playgroundDb(), code));
}

async function resetPlayground(): Promise<void> {
  const old = playground;
  playground = null;
  if (old) await (await old.catch(() => null))?.close();
  await playgroundDb();
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const KINDS: Record<string, TableInfo["kind"]> = { r: "table", p: "table", v: "view", m: "materialized view" };

/** The playground's tables, views, and materialized views, with their columns
    (types written out in full, like numeric(10,2) and text[]), primary keys,
    and row counts. Read from pg_catalog, since information_schema leaves out
    materialized views. */
async function describePlayground(): Promise<TableInfo[]> {
  const db = await playgroundDb();
  const tables = await db.query<{ name: string; kind: string }>(
    `SELECT c.relname AS name, c.relkind AS kind
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
     ORDER BY c.relname`
  );
  const columns = await db.query<{ table: string; name: string; type: string; nullable: boolean; key: boolean }>(
    `SELECT c.relname AS table, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
            NOT a.attnotnull AS nullable,
            EXISTS (
              SELECT 1 FROM pg_index i
              WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey)
            ) AS key
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
     ORDER BY c.relname, a.attnum`
  );
  return Promise.all(
    tables.rows.map(async (t) => {
      let rows: number | null = null;
      try {
        rows = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${quoteIdent(t.name)}`)).rows[0]?.n ?? 0);
      } catch {
        // A view whose tables are gone, or a materialized view not filled yet.
        rows = null;
      }
      return {
        name: t.name,
        kind: KINDS[t.kind] ?? "table",
        rows,
        columns: columns.rows
          .filter((c) => c.table === t.name)
          .map((c) => ({ name: c.name, type: c.type, nullable: Boolean(c.nullable), key: Boolean(c.key) })),
      };
    })
  );
}

async function previewTable(name: string, limit = 50): Promise<SqlRun> {
  return runSql(await playgroundDb(), `SELECT * FROM ${quoteIdent(name)} LIMIT ${limit}`);
}

/** What the page can ask for (lib/sql/browser.ts), each answered once. */
const OPS = { runSqlScript, runPlayground, resetPlayground, describePlayground, previewTable };
export type SqlOp = keyof typeof OPS;

// The worker's own scope (typed by hand, so this file needs no webworker lib).
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; op: SqlOp; args: unknown[] }>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    const run = OPS[op] as (...a: unknown[]) => Promise<unknown>;
    scope.postMessage({ id, ok: true, value: await run(...args) });
  } catch (err) {
    scope.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
