// Vitest's global setup for the int project: runs once before its files. It brings
// TEST_DATABASE_URL up to the latest migration (applying only what is missing, so a database
// that is already current is untouched). Each test file then reloads the demo rows itself.
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/db/client.ts";
import { testDatabaseUrl } from "./test-db.ts";

export default async function setup(): Promise<void> {
  const { db, pool } = createDb(testDatabaseUrl());
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  } finally {
    await pool.end();
  }
}
