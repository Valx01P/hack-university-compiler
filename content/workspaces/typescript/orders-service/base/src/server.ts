// The entry point: reads the settings, opens the database (building it on the first run),
// listens on PORT, and closes cleanly on Ctrl+C (SIGINT) or SIGTERM, so requests in flight
// finish and the database file is closed properly.
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { buildDatabase, openDatabase } from "#repositories/sqlite/db.ts";
import { sqliteRepositories } from "#repositories/sqlite/repositories.ts";
import { createApp } from "./app.ts";
import { fixedClock, systemClock } from "./clock.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { dailyReport } from "./reports/daily.ts";

const loaded = loadConfig(process.env);
if (!loaded.ok) {
  console.error(`The settings are not valid:\n${loaded.message}`);
  process.exitCode = 1;
} else {
  const { config } = loaded;
  const clock = config.HU_FIXED_TIME ? fixedClock(config.HU_FIXED_TIME) : systemClock;
  const logger = createLogger({ level: config.LOG_LEVEL, clock });

  const path = resolve(config.DATABASE_PATH);
  const firstRun = !existsSync(path);
  mkdirSync(dirname(path), { recursive: true });
  const db = openDatabase(path);
  if (firstRun) {
    buildDatabase(db);
    logger.info(`created ${config.DATABASE_PATH} from db/migrations and db/seed.sql`);
  }

  const app = createApp({ repositories: sqliteRepositories(db), clock, logger, dailyReport: (date) => dailyReport(db, date) });
  const server = createServer(app.handle);
  server.listen(config.PORT, config.HOST, () => {
    const address = server.address();
    // address() is a string for a pipe, null before listening, or an object for TCP.
    const port = typeof address === "object" && address !== null ? address.port : config.PORT;
    logger.info(`listening on http://localhost:${port}`, { port });
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, closing`);
    server.close(() => {
      db.close();
    });
  };
  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}
