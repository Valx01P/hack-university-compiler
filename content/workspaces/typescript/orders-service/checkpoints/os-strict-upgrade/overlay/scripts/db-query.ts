// npm run db:query -- "SELECT sku, stock FROM products": runs one SQL statement and prints the
// rows as an aligned table. node:sqlite gives each row as Record<string, SQLOutputValue> (with
// a null prototype, so console.log would print [Object: null prototype]), which is why each
// value is turned into text here.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SQLOutputValue } from "node:sqlite";
import { openDatabase } from "#repositories/sqlite/db.ts";

function text(value: SQLOutputValue): string {
  if (value === null) return "NULL";
  if (value instanceof Uint8Array) return `<${value.length} bytes>`;
  return String(value);
}

const sql = process.argv[2];
const path = resolve(process.env.DATABASE_PATH ?? "data/bramble.db");
if (sql === undefined || sql.trim() === "") {
  console.error('Usage: npm run db:query -- "SELECT * FROM products"');
  process.exitCode = 2;
} else if (!existsSync(path)) {
  console.error(`There is no database at ${path} yet. Run npm run db:reset first.`);
  process.exitCode = 1;
} else {
  const db = openDatabase(path);
  const rows = db.prepare(sql).all();
  const first = rows[0];
  if (first === undefined) console.log("(0 rows)");
  else {
    const columns = Object.keys(first);
    const cells = rows.map((row) => columns.map((column) => text(row[column] ?? null)));
    const widths = columns.map((column, i) => Math.max(column.length, ...cells.map((row) => (row[i] ?? "").length)));
    const line = (values: readonly string[]): string => values.map((value, i) => value.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
    console.log([line(columns), line(widths.map((width) => "-".repeat(width))), ...cells.map(line)].join("\n"));
    console.log(`(${rows.length} ${rows.length === 1 ? "row" : "rows"})`);
  }
  db.close();
}
