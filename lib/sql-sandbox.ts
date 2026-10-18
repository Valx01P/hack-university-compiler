/**
 * A small preset SQLite database for the SQL compiler playground. The schema is
 * prepended to the user's query at run time (so SELECTs return real rows), and a
 * dump of every sandbox table is appended behind markers so the UI can show the
 * database's CURRENT state after the query runs — letting learners see how their
 * INSERT/UPDATE/DELETE actually affect it. Pure data; safe on client + server.
 */

export interface SqlTable {
  name: string;
  columns: string[];
  rows: string[][];
}

/** Initial seed — kept in sync with SQL_SANDBOX_SCHEMA below. */
export const SQL_SANDBOX_TABLES: SqlTable[] = [
  {
    name: "departments",
    columns: ["id", "name"],
    rows: [
      ["1", "Engineering"],
      ["2", "Sales"],
      ["3", "Marketing"],
    ],
  },
  {
    name: "employees",
    columns: ["id", "name", "department_id", "salary", "hired"],
    rows: [
      ["1", "Alice", "1", "120000", "2021-03-01"],
      ["2", "Bob", "1", "105000", "2022-07-15"],
      ["3", "Carol", "2", "90000", "2020-01-20"],
      ["4", "Dave", "2", "85000", "2023-05-10"],
      ["5", "Eve", "3", "95000", "2021-11-30"],
    ],
  },
];

export const SQL_SANDBOX_SCHEMA = `CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO departments (id, name) VALUES
  (1, 'Engineering'),
  (2, 'Sales'),
  (3, 'Marketing');

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  salary INTEGER,
  hired TEXT
);
INSERT INTO employees (id, name, department_id, salary, hired) VALUES
  (1, 'Alice', 1, 120000, '2021-03-01'),
  (2, 'Bob', 1, 105000, '2022-07-15'),
  (3, 'Carol', 2, 90000, '2020-01-20'),
  (4, 'Dave', 2, 85000, '2023-05-10'),
  (5, 'Eve', 3, 95000, '2021-11-30');`;

// Sentinels that separate the user's query output from the table dump. They ride
// out as plain rows in sqlite3's default list mode (pipe-separated, no headers).
const END_MARKER = "@@HU_DB_END@@";
const TBL_MARKER = "@@HU_DB_TBL@@";

/** Wrap the user's SQL: load the sandbox, run their query, then dump every
    sandbox table so the UI can render the resulting database state. */
export function buildSqlProgram(userCode: string): string {
  const dump = SQL_SANDBOX_TABLES.map(
    (t) => `SELECT '${TBL_MARKER}${t.name}';\nSELECT * FROM ${t.name};`
  ).join("\n");
  return `${SQL_SANDBOX_SCHEMA}\n\n${userCode}\n\nSELECT '${END_MARKER}';\n${dump}\n`;
}

/** Split a sandbox run's stdout into the user's query output and the dumped
    table state. Columns come from our definitions (sqlite list mode is headerless). */
export function parseSqlRun(stdout: string): { output: string; tables: SqlTable[] } {
  const lines = stdout.split("\n");
  const endIdx = lines.findIndex((l) => l.trim() === END_MARKER);
  if (endIdx === -1) return { output: stdout.trimEnd(), tables: [] };

  const output = lines.slice(0, endIdx).join("\n").trimEnd();
  const tables: SqlTable[] = [];
  let cur: SqlTable | null = null;
  for (const line of lines.slice(endIdx + 1)) {
    if (line.startsWith(TBL_MARKER)) {
      const name = line.slice(TBL_MARKER.length).trim();
      const def = SQL_SANDBOX_TABLES.find((t) => t.name === name);
      cur = { name, columns: def?.columns ?? [], rows: [] };
      tables.push(cur);
    } else if (cur && line.length > 0) {
      cur.rows.push(line.split("|"));
    }
  }
  return { output, tables };
}
