// npm run db:reset: back to the starting point with the real tools. Drops the public and
// drizzle schemas, applies every migration in drizzle/, and loads the seed. (The IDE's Reset
// database button gets the same result faster, by cloning a template database.)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { freezeClock } from "../src/clock.ts";
import { loadConfig } from "../src/config.ts";
import { createDb } from "../src/db/client.ts";
import { seedDatabase } from "./seed-data.ts";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as { entries: unknown[] };

const config = loadConfig(process.env);
freezeClock(config.fixedTime);
const { db, pool } = createDb(config.databaseUrl);
try {
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await migrate(db, { migrationsFolder });
  const counts = await seedDatabase(db);
  console.log(
    `Applied ${journal.entries.length} migrations, then seeded ${counts.users} users, ${counts.venues} venues, ` +
      `${counts.events} events, ${counts.ticketTypes} ticket types, and ${counts.orders} orders`,
  );
} finally {
  await pool.end();
}
