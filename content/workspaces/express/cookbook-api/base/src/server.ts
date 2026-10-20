// The entry point: load the settings, open the database connection, build the app, and listen
// on PORT. On SIGINT or SIGTERM it stops taking new connections, lets in-flight requests
// finish, and then disconnects from MongoDB.
import { connect, disconnect } from "./db/mongoose.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";

const config = loadConfig(process.env);
const logger = createLogger({ level: config.LOG_LEVEL, pretty: config.NODE_ENV === "development" });

await connect(config.MONGODB_URI);
logger.info("connected to MongoDB");

const app = createApp(config, logger);
const server = app.listen(config.PORT, "0.0.0.0", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.PORT;
  logger.info(`Listening on http://localhost:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void disconnect().then(() => process.exit(0));
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
