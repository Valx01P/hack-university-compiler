// npm run db:reset: builds the database again from db/migrations and db/seed.sql, so you can
// start over after an experiment. It takes about 100 ms. The file is emptied and rebuilt in
// place, in one transaction, instead of being deleted: a running server keeps the file open,
// so it sees the fresh data at once, with no restart.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import * as z from "zod";
import { buildDatabase, inTransaction, openDatabase } from "#repositories/sqlite/db.ts";

const path = resolve(process.env.DATABASE_PATH ?? "data/bramble.db");
mkdirSync(dirname(path), { recursive: true });

const Table = z.object({ name: z.string() });
const Count = z.object({ count: z.number().int() });

let db = openDatabase(path);
let tables: string[];
try {
  tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => Table.parse(row).name);
} catch {
  // Not a file SQLite can read, so there is nothing to keep: start from a new one.
  db.close();
  for (const file of [path, `${path}-journal`, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true });
  db = openDatabase(path);
  tables = [];
}

// SQLite ignores this pragma inside a transaction, so it changes first. With it off, the old
// tables can be dropped in any order, and foreign_key_check proves the seed afterwards.
db.exec("PRAGMA foreign_keys = OFF");
const { migrations } = inTransaction(db, () => {
  for (const table of tables) db.exec(`DROP TABLE "${table}"`);
  return buildDatabase(db);
});
db.exec("PRAGMA foreign_keys = ON");
const broken = db.prepare("PRAGMA foreign_key_check").all();
if (broken.length > 0) throw new Error(`db/seed.sql breaks ${broken.length} foreign keys`);

const count = (table: "customers" | "products" | "orders"): number => Count.parse(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count;
console.log(
  `Rebuilt ${relative(process.cwd(), path)} from ${migrations.length} migrations and db/seed.sql: ` +
    `${count("customers")} customers, ${count("products")} products, ${count("orders")} orders`,
);
db.close();
