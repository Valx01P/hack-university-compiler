// npm run db:seed: replaces every row with the demo data in scripts/seed-data.ts. The schema
// must already be migrated (npm run db:migrate). npm run db:reset does both from scratch.
import { freezeClock } from "../src/clock.ts";
import { loadConfig } from "../src/config.ts";
import { createDb } from "../src/db/client.ts";
import { seedDatabase } from "./seed-data.ts";

const config = loadConfig(process.env);
freezeClock(config.fixedTime);
const { db, pool } = createDb(config.databaseUrl);
try {
  const counts = await seedDatabase(db);
  console.log(
    `Seeded ${counts.users} users, ${counts.venues} venues, ${counts.events} events, ` +
      `${counts.ticketTypes} ticket types, ${counts.orders} orders (${counts.orderItems} items), ${counts.favorites} favorites`,
  );
} finally {
  await pool.end();
}
