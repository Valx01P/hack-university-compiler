// The SQL engine's shared core, used by the app (in the browser) and by the
// content verifiers (in Node), so both run and print SQL exactly the same way.
// It runs a script statement by statement on a PGlite database and prints the
// results the way psql does: an aligned table and a row count for statements
// that return rows, a command tag (CREATE TABLE, INSERT 0 2, ...) for the rest,
// and "ERROR:  ..." at the first statement that fails.

/** Splits a SQL script into statements on top-level semicolons, skipping the
    ones inside quotes, quoted identifiers, dollar-quoted bodies, and comments.
    Statements that hold only comments or whitespace are dropped. */
export function splitSql(sql) {
  const out = [];
  let start = 0;
  let i = 0;
  const n = sql.length;
  const push = (end) => {
    const text = sql.slice(start, end).trim();
    if (stripComments(text).trim()) out.push(text);
  };
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? n : nl + 1;
    } else if (c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") (depth++, (i += 2));
        else if (sql[i] === "*" && sql[i + 1] === "/") (depth--, (i += 2));
        else i++;
      }
    } else if (c === "'") {
      // E'...' strings allow backslash escapes.
      const escapes = i > 0 && /[eE]/.test(sql[i - 1]) && !/[\w$]/.test(sql[i - 2] ?? "");
      i++;
      while (i < n) {
        if (escapes && sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          break;
        } else i++;
      }
    } else if (c === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') {
          i++;
          break;
        } else i++;
      }
    } else if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m && !/[\w]/.test(sql[i - 1] ?? "")) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end < 0 ? n : end + tag.length;
      } else i++;
    } else if (c === ";") {
      push(i);
      i++;
      start = i;
    } else i++;
  }
  push(n);
  return out;
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Types psql right-aligns: the numeric ones. */
const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 790, 1700]);

/** psql's "(1 row)" / "(N rows)" footer. */
const rowCount = (n) => `(${n} row${n === 1 ? "" : "s"})`;

/** One result set as psql's aligned table, trailing spaces trimmed. */
export function formatTable(columns, rows) {
  const cells = rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v).replace(/\r?\n/g, "\\n"))));
  const widths = columns.map((c, i) => Math.max(c.name.length, ...cells.map((r) => r[i].length)));
  const center = (s, w) => {
    const left = Math.floor((w - s.length) / 2);
    return " ".repeat(left) + s + " ".repeat(w - s.length - left);
  };
  const line = (parts) => parts.map((p) => ` ${p} `).join("|").replace(/\s+$/, "");
  const header = line(columns.map((c, i) => center(c.name, widths[i])));
  const rule = widths.map((w) => "-".repeat(w + 2)).join("+");
  const body = cells.map((r) =>
    line(r.map((v, i) => (NUMERIC_OIDS.has(columns[i].type) ? v.padStart(widths[i]) : v.padEnd(widths[i]))))
  );
  return [header, rule, ...body, rowCount(rows.length)].join("\n");
}

/** A statement's uppercase words with every parenthesized group removed. */
function outsideParens(statement) {
  let s = stripComments(statement).toUpperCase();
  while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, " ");
  return s.trim().split(/\s+/);
}

/** The tag psql prints for a statement that returns no rows. */
export function commandTag(statement, affected) {
  const words = stripComments(statement).trim().toUpperCase().split(/\s+/);
  const first = words[0] ?? "";
  const n = affected ?? 0;
  switch (first) {
    case "INSERT":
      return `INSERT 0 ${n}`;
    case "UPDATE":
    case "DELETE":
    case "MERGE":
    case "COPY":
    case "FETCH":
    case "MOVE":
      return `${first} ${n}`;
    case "SELECT":
    case "WITH":
    case "TABLE":
    case "VALUES":
      return `SELECT ${n}`;
    case "START":
      return "BEGIN";
    case "END":
      return "COMMIT";
    case "ABORT":
      return "ROLLBACK";
    case "TRUNCATE":
      return "TRUNCATE TABLE";
    case "CREATE":
    case "DROP":
    case "ALTER": {
      // CREATE [OR REPLACE] [TEMP | TEMPORARY | UNLOGGED | UNIQUE] <object>
      const rest = words.slice(1).filter((w) => !["OR", "REPLACE", "TEMP", "TEMPORARY", "UNLOGGED", "UNIQUE", "GLOBAL", "LOCAL"].includes(w));
      if (rest[0] === "MATERIALIZED" && rest[1] === "VIEW") return `${first} MATERIALIZED VIEW`;
      // CREATE TABLE ... AS <query> prints SELECT n. Look for AS outside the
      // column list, so GENERATED ALWAYS AS IDENTITY stays a CREATE TABLE.
      if (first === "CREATE" && rest[0] === "TABLE" && outsideParens(statement).includes("AS")) return `SELECT ${n}`;
      return `${first} ${rest[0] ?? ""}`.trim();
    }
    default:
      return first;
  }
}

/** Built-in type ids mapped to "keep the text", so values come back exactly as
    Postgres prints them (t/f, 2024-01-31, {a,b}, Infinity). Types created later
    in a session have no parser and come back as text anyway. */
const rawParsers = new WeakMap();
async function parsersFor(db) {
  let p = rawParsers.get(db);
  if (!p) {
    const oids = (await db.query("SELECT oid FROM pg_type")).rows.map((r) => r.oid);
    p = Object.fromEntries(oids.map((oid) => [oid, (value) => value]));
    rawParsers.set(db, p);
  }
  return p;
}

/**
 * Runs a script on a PGlite database statement by statement and returns each
 * statement's result, stopping at the first error. A result is
 * { kind: "rows", statement, columns: [{ name, type }], rows: string[][] } or
 * { kind: "command", statement, tag }.
 */
export async function runSql(db, script) {
  const parsers = await parsersFor(db);
  const results = [];
  for (const statement of splitSql(script)) {
    try {
      const r = await db.query(statement, [], { rowMode: "array", parsers });
      if (r.fields.length) {
        results.push({
          kind: "rows",
          statement,
          columns: r.fields.map((f) => ({ name: f.name, type: f.dataTypeID })),
          rows: r.rows,
        });
      } else {
        results.push({ kind: "command", statement, tag: commandTag(statement, r.affectedRows) });
      }
    } catch (err) {
      return { results, error: { statement, message: err?.message ?? String(err) } };
    }
  }
  return { results, error: null };
}

/** psql's text for a run: each result in order, a blank line between them. */
export function formatRun({ results }) {
  return results.map((r) => (r.kind === "rows" ? formatTable(r.columns, r.rows) : r.tag)).join("\n\n");
}

/** psql's text for an error. */
export const formatError = (error) => `ERROR:  ${error.message}`;
