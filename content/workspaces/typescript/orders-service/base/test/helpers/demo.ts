// The demo data from db/seed.sql, so tests on either kind of repository start from exactly
// what npm run db:reset builds: a SQLite database in memory, or Maps copied from one.
import { DatabaseSync } from "node:sqlite";
import { buildDatabase } from "#repositories/sqlite/db.ts";
import { memoryRepositories } from "#repositories/memory/repositories.ts";
import { sqliteRepositories } from "#repositories/sqlite/repositories.ts";
import { CustomerRow } from "#repositories/sqlite/rows.ts";

export function demoDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  buildDatabase(db);
  return db;
}

export function demoMemoryRepositories(): ReturnType<typeof memoryRepositories> {
  const db = demoDatabase();
  const sqlite = sqliteRepositories(db);
  const repositories = memoryRepositories({
    orders: sqlite.orders.findAll({ limit: 1000, cursor: null }).items,
    products: sqlite.products.list(),
    customers: db
      .prepare("SELECT * FROM customers")
      .all()
      .map((row) => CustomerRow.parse(row)),
  });
  db.close();
  return repositories;
}
