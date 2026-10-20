// The composition root: the one file that reads the environment, builds every object, and
// opens the port. Everything else gets what it needs passed in (createApp(deps)), so tests
// build the same app from fakes. Run it with npm run dev, which restarts it on every save.
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "./app.ts";
import { freezeClock } from "./clock.ts";
import { type Config, ConfigError, loadConfig } from "./config.ts";
import { createDb, ping } from "./db/client.ts";
import { createLogger } from "./logger.ts";
import { Readiness } from "./modules/health/health.routes.ts";
import { createServices, pgRepositories } from "./services.ts";

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  // Before the logger exists: a plain message, then exit 1 so a supervisor notices.
  console.error(err.message);
  process.exit(1);
}

freezeClock(config.fixedTime);
const logger = createLogger(config);
const database = createDb(config.databaseUrl, {
  statementTimeoutMs: config.db.statementTimeoutMs,
  onPoolError: (err) => logger.error({ err }, "an idle database connection failed"),
});

if (config.migrateOnStart) {
  // Fine for development. In production, migrate as a release step instead (scripts/migrate.ts).
  await migrate(database.db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  logger.info("migrations applied");
}

const { services, tokens, posters } = createServices({ db: database.db, repositories: pgRepositories, config, logger });
const readiness = new Readiness();
const app = createApp({
  config,
  logger,
  services,
  tokens,
  posters,
  readiness,
  checkDatabase: () => ping(database.pool, 1_000),
  queries: database.queries,
});

const server = app.listen(config.port, config.host, (err) => {
  if (err !== undefined) {
    logger.fatal({ err }, `could not listen on port ${config.port}`);
    process.exit(1);
  }
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.port;
  logger.info({ config }, `Listening on http://localhost:${port}`);
});
// Longer than a load balancer's idle timeout (often 60 s), so the balancer closes idle
// connections first and never sends a request into one this server is closing.
server.keepAliveTimeout = config.http.keepAliveTimeoutMs;
server.headersTimeout = config.http.headersTimeoutMs;
server.requestTimeout = config.http.requestTimeoutMs;

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.warn({ signal }, "second signal: exiting now");
    process.exit(1);
  }
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  // /readyz now answers 503. The delay gives a load balancer time to notice and stop sending traffic.
  readiness.drain();
  if (config.shutdown.delayMs > 0) await sleep(config.shutdown.delayMs);

  // Stop accepting connections and let requests in flight finish, up to the deadline.
  const deadline = setTimeout(() => {
    logger.warn("shutdown deadline passed: closing the connections still open");
    server.closeAllConnections();
  }, config.shutdown.timeoutMs);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  clearTimeout(deadline);

  await database.pool.end();
  logger.info("shutdown complete");
  logger.flush(() => process.exit(0));
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));
// After an unexpected error the process state is unknown: log it, then let a supervisor restart it.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  logger.flush(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  logger.flush(() => process.exit(1));
});
