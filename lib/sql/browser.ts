import type { PGlite } from "@electric-sql/pglite";
import { formatError, formatRun, prepareDatabase, runSql, type SqlRun } from "@/lib/sql/core.mjs";
import { SAMPLE_DB_SQL } from "@/lib/sql/sample-db";

/**
 * SQL in the browser: PostgreSQL compiled to WebAssembly (PGlite), loaded the
 * first time something runs SQL. Lessons and challenges get a brand-new
 * database for every run, loaded with their setup. The compiler's playground
 * keeps one database for the whole visit, starting from the sample data, so
 * you can watch your changes pile up (and reset it).
 */
let pglite: Promise<typeof import("@electric-sql/pglite")> | null = null;

async function newDatabase(): Promise<PGlite> {
  pglite ??= import("@electric-sql/pglite");
  const { PGlite } = await pglite;
  return prepareDatabase(new PGlite());
}

/** Runs a script on a fresh database after its setup, and reports it like a
    program run: psql's output on stdout, the error (if any) on stderr. */
export async function runSqlScript(code: string, setup: string): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  const db = await newDatabase();
  try {
    if (setup.trim()) {
      const prepared = await runSql(db, setup);
      if (prepared.error) return { stdout: "", stderr: `The setup failed. ${formatError(prepared.error)}`, failed: true };
    }
    const run = await runSql(db, code);
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

/** Runs a script on the playground database. */
export async function runPlayground(code: string): Promise<SqlRun> {
  return runSql(await playgroundDb(), code);
}

/** Puts the playground back to the sample data. */
export async function resetPlayground(): Promise<void> {
  const old = playground;
  playground = null;
  if (old) await (await old.catch(() => null))?.close();
  await playgroundDb();
}

export interface TableInfo {
  name: string;
  kind: "table" | "view" | "materialized view";
  rows: number | null;
  columns: { name: string; type: string; nullable: boolean; key: boolean }[];
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const KINDS: Record<string, TableInfo["kind"]> = { r: "table", p: "table", v: "view", m: "materialized view" };

/** The playground's tables, views, and materialized views, with their columns
    (types written out in full, like numeric(10,2) and text[]), primary keys,
    and row counts. Read from pg_catalog, since information_schema leaves out
    materialized views. */
export async function describePlayground(): Promise<TableInfo[]> {
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

/** The first rows of one playground table or view. */
export async function previewTable(name: string, limit = 50): Promise<SqlRun> {
  return runSql(await playgroundDb(), `SELECT * FROM ${quoteIdent(name)} LIMIT ${limit}`);
}
