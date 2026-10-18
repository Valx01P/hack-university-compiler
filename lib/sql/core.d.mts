// Types for lib/sql/core.mjs (plain JavaScript so the Node verifiers can use it).
import type { PGliteInterface } from "@electric-sql/pglite";

export interface SqlColumn {
  name: string;
  /** The Postgres type id, used to right-align numbers. */
  type: number;
}

export type SqlResult =
  | { kind: "rows"; statement: string; columns: SqlColumn[]; rows: (string | null)[][] }
  | { kind: "command"; statement: string; tag: string };

export interface SqlRun {
  results: SqlResult[];
  error: { statement: string; message: string } | null;
}

export function splitSql(sql: string): string[];
export function formatTable(columns: SqlColumn[], rows: (string | null)[][]): string;
export function commandTag(statement: string, affected?: number): string;
export function prepareDatabase<T extends PGliteInterface>(db: T): Promise<T>;
export function runSql(db: PGliteInterface, script: string): Promise<SqlRun>;
export function formatRun(run: { results: SqlResult[] }): string;
export function formatError(error: { message: string }): string;
