// Opens the SQLite database and runs work in transactions. node:sqlite is synchronous, so a
// transaction is one plain function call between BEGIN and COMMIT, and no other request can
// run in the middle of it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import { countQuery } from "./query-counter.ts";

const DB_FOLDER = join(import.meta.dirname, "..", "..", "..", "db");

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // SQLite only checks REFERENCES when this is on, and it is off by default.
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/** Applies every migration in name order, then the seed, so an empty database becomes the demo one. */
export function buildDatabase(db: DatabaseSync, options: { readonly seed: boolean } = { seed: true }): { migrations: string[] } {
  const migrations = readdirSync(join(DB_FOLDER, "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) db.exec(readFileSync(join(DB_FOLDER, "migrations", file), "utf8"));
  if (options.seed) db.exec(readFileSync(join(DB_FOLDER, "seed.sql"), "utf8"));
  return { migrations };
}

/** Runs a query and counts it. Rows come back as node:sqlite types them, untyped columns and all. */
export function queryRows(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Record<string, SQLOutputValue>[] {
  countQuery();
  return db.prepare(sql).all(...params);
}

export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  // IMMEDIATE takes the write lock up front, so two writers never deadlock halfway through.
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
