import { randomBytes } from "node:crypto";
import { commandTag, splitSql } from "../../lib/sql/core.mjs";

/**
 * The Database panel's queries and how their output is read (architecture
 * §3.2, §4.5). SQL runs through psql as the workspace's role in its client
 * container (clients.ts), and every statement's output is fenced by markers
 * carrying a random nonce, so the panel can show each result the way the SQL
 * page does (components/compiler/sql-results.tsx): a table for rows, the tag
 * psql prints for the rest, and the error that stopped the script. At most
 * 500 rows per result come back.
 */

export const MAX_ROWS = 500;
/** Output read from psql, past which the rest is dropped and the result says truncated. */
export const MAX_OUTPUT = 4 * 1024 * 1024;

export interface Column {
  name: string;
  /** The PostgreSQL type id (numbers right-align in sql-results.tsx), 25 (text) when unknown. */
  type: number;
  /** The type as format_type writes it: integer, numeric(10,2), text[]. */
  typeName: string;
}

export type Result =
  | { kind: "rows"; statement: string; columns: Column[]; rows: (string | null)[][]; tag: string; truncated: boolean }
  | { kind: "command"; statement: string; tag: string };

/** POST …/db/query's answer for SQL: the last result up front, every result in `results`. */
export interface SqlAnswer {
  engine: "postgres";
  database: string;
  columns: Column[];
  rows: (string | null)[][];
  tag: string | null;
  error: { message: string; statement: string | null } | null;
  truncated: boolean;
  results: Result[];
  ms: number;
}

/** The type ids sql-results.tsx right-aligns, and a few others, by the name format_type gives. */
const TYPE_IDS: Record<string, number> = {
  smallint: 21,
  integer: 23,
  bigint: 20,
  real: 700,
  "double precision": 701,
  numeric: 1700,
  money: 790,
  oid: 26,
  boolean: 16,
  text: 25,
  "character varying": 1043,
  character: 1042,
  date: 1082,
  "timestamp without time zone": 1114,
  "timestamp with time zone": 1184,
  "time without time zone": 1083,
  interval: 1186,
  json: 114,
  jsonb: 3802,
  uuid: 2950,
  bytea: 17,
};

export function typeId(name: string): number {
  return TYPE_IDS[name.replace(/\(.*\)$/, "").trim()] ?? 25;
}

/**
 * The psql input for a learner's script: each statement described (\gdesc,
 * which never runs it), then run, between markers. A psql meta-command such
 * as \dt runs as written. ON_ERROR_STOP ends the script at the first error.
 */
export function queryScript(sql: string, nonce: string): { script: string; statements: string[] } {
  const statements: string[] = [];
  for (const chunk of splitSql(sql) as string[]) {
    // A meta-command takes its whole line, so leading ones are statements of their own.
    const lines = chunk.split("\n");
    while (lines.length && lines[0].trim().startsWith("\\")) statements.push(lines.shift()!.trim());
    const rest = lines.join("\n").trim();
    if (rest && splitSql(rest).length) statements.push(rest);
  }
  const lines = ["\\set ON_ERROR_STOP 1", "\\set FETCH_COUNT 1000"];
  statements.forEach((statement: string, i: number) => {
    const text = statement.trim().replace(/;\s*$/, "");
    if (text.startsWith("\\")) {
      lines.push(`\\echo ${nonce} ${i} run`, text, `\\echo ${nonce} ${i} end`);
    } else {
      lines.push(`\\echo ${nonce} ${i} describe`, text, "\\gdesc", `\\echo ${nonce} ${i} run`, "\\g", `\\echo ${nonce} ${i} end`);
    }
  });
  return { script: `${lines.join("\n")}\n`, statements };
}

export function newNonce(): string {
  return `hu${randomBytes(9).toString("hex")}`;
}

/** psql's command line for a query: CSV with NULLs written as a token no value can guess. */
export function queryArgs(nonce: string): string[] {
  return ["psql", "-X", "-P", "format=csv", "-P", "pager=off", "-P", `null=${nonce}N`, "-f", "-"];
}

/** Splits CSV into records, keeping quoted fields apart (NULLs come as the null token). */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
    i++;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** Reads psql's output back into one result per statement, and the error that stopped it. */
export function readQueryOutput(
  out: string,
  err: string,
  statements: string[],
  nonce: string,
  outputCut: boolean
): { results: Result[]; error: { message: string; statement: string | null } | null; truncated: boolean } {
  const nullToken = `${nonce}N`;
  const sections = new Map<string, string>();
  const marker = new RegExp(`^${nonce} (\\d+) (describe|run|end)$`, "gm");
  let last: { key: string; from: number } | null = null;
  const reached = new Set<number>();
  const ended = new Set<number>();
  for (const m of out.matchAll(marker)) {
    if (last) sections.set(last.key, out.slice(last.from, m.index));
    const index = Number(m[1]);
    reached.add(index);
    if (m[2] === "end") {
      ended.add(index);
      last = null;
    } else {
      last = { key: `${index} ${m[2]}`, from: (m.index ?? 0) + m[0].length + 1 };
    }
  }
  if (last) sections.set(last.key, out.slice(last.from));

  const results: Result[] = [];
  let truncated = false;
  for (const [i, statement] of statements.entries()) {
    if (!ended.has(i)) {
      // Cut off: the output cap, or the error below. Rows that came are kept.
      const partial = sections.get(`${i} run`);
      if (outputCut && partial) {
        const r = rowsResult(statement, sections.get(`${i} describe`) ?? "", partial, nullToken, true);
        if (r) results.push(r);
        truncated = true;
      }
      break;
    }
    const run = sections.get(`${i} run`) ?? "";
    const r = rowsResult(statement, sections.get(`${i} describe`) ?? null, run, nullToken, false);
    if (r) {
      truncated ||= r.kind === "rows" && r.truncated;
      results.push(r);
    } else {
      results.push({ kind: "command", statement, tag: run.trim().split("\n").pop() || commandTag(statement) });
    }
  }

  let error: { message: string; statement: string | null } | null = null;
  const failed = /^psql:[^\n]*?:\d+: (?:ERROR|FATAL):\s+([\s\S]*)$/m.exec(err);
  if (failed) {
    const index = [...reached].filter((i) => !ended.has(i)).sort((a, b) => a - b)[0];
    error = { message: failed[1].replace(/\npsql:[\s\S]*$/, "").trimEnd(), statement: index === undefined ? null : (statements[index] ?? null) };
  } else if (!outputCut && statements.length && ended.size < statements.length && err.trim()) {
    error = { message: err.trim().replace(/^psql:[^:]*:\d+: /, "").slice(0, 2000), statement: null };
  }
  return { results, error, truncated };
}

/** A statement's rows, when its description (or its output, for a meta-command) has columns. */
function rowsResult(statement: string, describe: string | null, run: string, nullToken: string, cut: boolean): Result | null {
  let columns: Column[] | null = null;
  if (describe !== null) {
    const d = parseCsv(describe.trim() ? `${describe.trim()}\n` : "");
    if (d.length && d[0][0] === "Column" && d[0][1] === "Type") {
      columns = d.slice(1).map(([name, typeName]) => ({ name, type: typeId(typeName ?? "text"), typeName: typeName ?? "text" }));
    } else {
      return null;
    }
  }
  const records = parseCsv(run);
  if (!records.length) return columns ? { kind: "rows", statement, columns, rows: [], tag: commandTag(statement, 0), truncated: cut } : null;
  const [header, ...data] = records;
  if (!columns) {
    // A meta-command (\dt): the first line is its header.
    if (statement.trim().startsWith("\\")) columns = header.map((name) => ({ name, type: 25, typeName: "text" }));
    else return null;
  }
  const rows = data.slice(0, MAX_ROWS).map((r) => r.map((v) => (v === nullToken ? null : v)));
  return { kind: "rows", statement, columns, rows, tag: commandTag(statement, data.length), truncated: cut || data.length > MAX_ROWS };
}

/** The panel's schema, as the workspace's role: one JSON value from PostgreSQL. */
export const SCHEMA_SQL = `SELECT json_build_object(
  'database', current_database(),
  'sizeBytes', pg_database_size(current_database()),
  'tables', coalesce((SELECT json_agg(t ORDER BY t.schema <> 'public', t.schema, t.name) FROM (
    SELECT n.nspname AS schema, c.relname AS name,
      CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'table' END AS kind,
      CASE
        WHEN c.relkind IN ('r', 'p') AND c.reltuples > 100000 THEN c.reltuples::bigint
        WHEN c.relkind IN ('r', 'p') OR (c.relkind = 'm' AND c.relispopulated)
          THEN (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
      END AS rows,
      coalesce((SELECT json_agg(json_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, a.atttypmod),
          'nullable', NOT a.attnotnull,
          'key', EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey))
        ) ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), '[]'::json) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'hu_stats')
      AND n.nspname !~ '^pg_(toast|temp)'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  ) t), '[]'::json)
);`;

/** A table, view, or materialized view, as components/compiler/sql-database.tsx lists them, plus its schema. */
export interface TableInfo {
  schema: string;
  name: string;
  kind: "table" | "view" | "materialized view";
  rows: number | null;
  columns: { name: string; type: string; nullable: boolean; key: boolean }[];
}

/** One cell of a document's top-level field, as text: ObjectId("…"), an ISO date, a number, or compact JSON. */
export function ejsonCell(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return String(value);
  const v = value as Record<string, unknown>;
  if (typeof v.$oid === "string") return `ObjectId("${v.$oid}")`;
  if (v.$date !== undefined) {
    const d = v.$date as { $numberLong?: string } | string | number;
    const ms = typeof d === "object" ? Number(d.$numberLong) : typeof d === "string" ? Date.parse(d) : d;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : JSON.stringify(v.$date);
  }
  for (const k of ["$numberInt", "$numberLong", "$numberDouble", "$numberDecimal"]) if (typeof v[k] === "string") return v[k] as string;
  return JSON.stringify(relaxed(value));
}

/** Canonical Extended JSON made readable: numbers as numbers, ids and dates as text. */
export function relaxed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(relaxed);
  if (value === null || typeof value !== "object") return value;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length === 1) {
    const [k] = keys;
    if (k === "$numberInt" || k === "$numberDouble") return Number(v[k]);
    if (k === "$numberLong" || k === "$numberDecimal") return String(v[k]);
    if (k === "$oid" || k === "$date") return ejsonCell(v);
  }
  return Object.fromEntries(keys.map((k) => [k, relaxed(v[k])]));
}
