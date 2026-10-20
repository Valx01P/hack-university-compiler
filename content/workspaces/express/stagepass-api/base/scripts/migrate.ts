// The release step that applies migrations in production, where drizzle-kit (a dev dependency)
// is not installed. drizzle-orm's own migrator reads drizzle/ and records each file in
// drizzle.__drizzle_migrations, exactly as npm run db:migrate does, so the two can be mixed.
// Run it once per deploy, before the new version starts: node scripts/migrate.ts
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadConfig } from "../src/config.ts";
import { createDb } from "../src/db/client.ts";

const config = loadConfig(process.env);
const { db, pool } = createDb(config.databaseUrl, { statementTimeoutMs: 600_000 });
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("Migrations are up to date");
} finally {
  await pool.end();
}
