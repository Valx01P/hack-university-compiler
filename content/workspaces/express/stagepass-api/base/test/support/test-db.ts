// The real database for integration tests: TEST_DATABASE_URL, never DATABASE_URL, because
// every test file empties it and loads the demo rows again.
import { createDb, type Database } from "../../src/db/client.ts";
import { seedDatabase } from "../../scripts/seed-data.ts";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "TEST_DATABASE_URL is not set. The int tests need their own PostgreSQL database " +
        "(the workspace sets it). npm run test:unit and npm run test:api need none.",
    );
  }
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not be your development database");
  return url;
}

export function openTestDb(): Database {
  return createDb(testDatabaseUrl(), { maxConnections: 20 });
}

/** Empties every table and loads the demo rows (the same ones npm run db:seed loads). */
export async function resetTestDb(database: Database): Promise<void> {
  await seedDatabase(database.db);
}
