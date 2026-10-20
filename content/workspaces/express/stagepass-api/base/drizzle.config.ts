// drizzle-kit's settings: where the schema lives, where migrations go, and which database
// `npm run db:migrate` applies them to. generate and check need no database at all.
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env, so load it here. Real environment variables still win.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // The migrator records each applied file in drizzle.__drizzle_migrations.
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});
