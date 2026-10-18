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
  kind: "table" | "view";
  rows: number | null;
  columns: { name: string; type: string; nullable: boolean; key: boolean }[];
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The playground's tables and views, their columns, and row counts. */
export async function describePlayground(): Promise<TableInfo[]> {
  const db = await playgroundDb();
  const tables = await db.query<{ name: string; kind: string }>(
    `SELECT table_name AS name, table_type AS kind FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  const columns = await db.query<{ table: string; name: string; type: string; nullable: string; key: boolean }>(
    `SELECT c.table_name AS table, c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
            EXISTS (
              SELECT 1 FROM information_schema.key_column_usage k
              JOIN information_schema.table_constraints t ON t.constraint_name = k.constraint_name AND t.table_name = k.table_name
              WHERE t.constraint_type = 'PRIMARY KEY' AND k.table_name = c.table_name AND k.column_name = c.column_name
            ) AS key
     FROM information_schema.columns c
     WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position`
  );
  return Promise.all(
    tables.rows.map(async (t) => {
      let rows: number | null = null;
      try {
        rows = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${quoteIdent(t.name)}`)).rows[0]?.n ?? 0);
      } catch {
        rows = null;
      }
      return {
        name: t.name,
        kind: t.kind === "VIEW" ? ("view" as const) : ("table" as const),
        rows,
        columns: columns.rows
          .filter((c) => c.table === t.name)
          .map((c) => ({ name: c.name, type: c.type, nullable: c.nullable === "YES", key: c.key })),
      };
    })
  );
}

/** The first rows of one playground table or view. */
export async function previewTable(name: string, limit = 50): Promise<SqlRun> {
  return runSql(await playgroundDb(), `SELECT * FROM ${quoteIdent(name)} LIMIT ${limit}`);
}
