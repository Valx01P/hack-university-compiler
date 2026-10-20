// Builds the Express app from a config and a logger. The database connection must already be
// open (server.ts and the tests connect first), because the session store and the command
// counter both ride on the same Mongo client. The order is deliberate: request id, request
// logging, JSON body, session, command counting, then the routes, then 404, then the error
// handler last.
import MongoStore from "connect-mongo";
import express, { type Express } from "express";
import session from "express-session";
import mongoose from "mongoose";
import { pinoHttp } from "pino-http";
import type { Config } from "./config.ts";
import { countDbCommands, watchCommands } from "./db/command-counter.ts";
import type { Logger } from "./logger.ts";
import { createErrorHandler } from "./middleware/error-handler.ts";
import { notFound } from "./middleware/not-found.ts";
import { requestId } from "./middleware/request-id.ts";
import { apiRouter } from "./routes/index.ts";
import { healthRouter } from "./routes/health.routes.ts";

export function createApp(config: Config, logger: Logger): Express {
  const app = express();
  app.set("sessionCookieName", config.SESSION_COOKIE_NAME);

  const countCommands = config.NODE_ENV !== "production";
  if (countCommands) watchCommands(mongoose.connection);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as { requestId?: string }).requestId ?? "" }));
  app.use(express.json());
  app.use(
    session({
      name: config.SESSION_COOKIE_NAME,
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ client: mongoose.connection.getClient(), collectionName: "sessions" }),
      cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    }),
  );
  app.use(countDbCommands(countCommands));

  app.use(healthRouter);
  app.use("/api", apiRouter());

  app.use(notFound);
  app.use(createErrorHandler(logger));

  return app;
}
