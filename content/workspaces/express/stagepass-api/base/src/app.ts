// createApp(deps) builds the Express app from what it is given and opens no port, so tests
// call it with fakes and supertest, and server.ts calls it with the real things. The order of
// app.use() is deliberate: each line can rely on everything above it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express, type Request, type RequestHandler } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";
import type { Config } from "./config.ts";
import type { QueryCounter } from "./db/client.ts";
import { type AccessTokenVerifier, authGuards } from "./http/auth.ts";
import { errorHandler, notFound } from "./http/error-handler.ts";
import { buildOpenApi, type RouteDoc } from "./http/openapi.ts";
import { apiLimiter, authLimiter } from "./http/rate-limit.ts";
import { requestId } from "./http/request-id.ts";
import { corsOptions, helmetOptions } from "./http/security.ts";
import { AuthController } from "./modules/auth/auth.controller.ts";
import { authDocs, authRoutes } from "./modules/auth/auth.routes.ts";
import { loadCalendar } from "./modules/events/calendar.ts";
import { EventsController } from "./modules/events/events.controller.ts";
import { eventsDocs, eventsRoutes } from "./modules/events/events.routes.ts";
import type { PosterStorage } from "./modules/events/posters.ts";
import { favoritesDocs, favoritesRoutes } from "./modules/favorites/favorites.routes.ts";
import { healthDocs, healthRoutes, type Readiness } from "./modules/health/health.routes.ts";
import { OrdersController } from "./modules/orders/orders.controller.ts";
import { ordersDocs, ordersRoutes } from "./modules/orders/orders.routes.ts";
import { PagesController } from "./modules/pages/pages.controller.ts";
import { pagesRoutes } from "./modules/pages/pages.routes.ts";
import { statsDocs, statsRoutes } from "./modules/stats/stats.routes.ts";
import { TicketTypesController } from "./modules/ticket-types/ticket-types.controller.ts";
import { ticketTypesDocs, ticketTypesRoutes } from "./modules/ticket-types/ticket-types.routes.ts";
import { VenuesController } from "./modules/venues/venues.controller.ts";
import { venuesDocs, venuesRoutes } from "./modules/venues/venues.routes.ts";
import type { Services } from "./services.ts";

export type AppDeps = {
  config: Config;
  logger: Logger;
  services: Services;
  tokens: AccessTokenVerifier;
  posters: PosterStorage;
  readiness: Readiness;
  checkDatabase: () => Promise<void>;
  /** When given (and config.queryCountHeader is on), every response says how many queries it ran. */
  queries?: QueryCounter;
};

/** Every documented route, for GET /openapi.json and npm run openapi. */
export const routeDocs: RouteDoc[] = [
  ...healthDocs,
  ...authDocs,
  ...venuesDocs,
  ...eventsDocs,
  ...ticketTypesDocs,
  ...ordersDocs,
  ...favoritesDocs,
  ...statsDocs,
];

const projectFile = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const { version } = JSON.parse(readFileSync(projectFile("package.json"), "utf8")) as { version: string };

/** Sets X-Query-Count just before the headers go out, counting every query the request ran. */
function queryCountHeader(queries: QueryCounter): RequestHandler {
  return (_req, res, next) => {
    const tally = { count: 0 };
    const writeHead = res.writeHead;
    res.writeHead = function (this: typeof res, ...args: unknown[]) {
      if (!this.headersSent) this.setHeader("X-Query-Count", String(tally.count));
      return Reflect.apply(writeHead, this, args);
    } as typeof res.writeHead;
    queries.track(tally, next);
  };
}

export function createApp(deps: AppDeps): Express {
  const { config, services } = deps;
  const auth = authGuards(deps.tokens);
  const app = express();

  // Behind a proxy, req.ip and req.protocol come from X-Forwarded-* only when this says so.
  app.set("trust proxy", config.trustProxy);
  app.set("view engine", "ejs");
  app.set("views", projectFile("views"));

  // 1. An id for the request, so every later log line and error can carry it.
  app.use(requestId());
  // 2. One structured log line per request, with that id. Health probes stay out of the logs.
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (req as Request).requestId,
      autoLogging: { ignore: (req) => req.url === "/healthz" || req.url === "/readyz" },
      customLogLevel: (_req, res, err) => (err !== undefined || res.statusCode >= 500 ? "warn" : "info"),
    }),
  );
  if (deps.queries !== undefined && config.queryCountHeader) app.use(queryCountHeader(deps.queries));
  // 3. Security headers on everything, pages and API alike.
  app.use(helmet(helmetOptions(config)));
  // 4. Files: the site's own assets, and uploaded posters from their own folder, never from public/.
  app.use(
    "/static",
    express.static(projectFile("public"), {
      maxAge: "1h",
      setHeaders: (res, path) => {
        if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.use(
    "/uploads/posters",
    express.static(deps.posters.postersDir, {
      // Names are random and never reused, so a poster can be cached for a year.
      immutable: true,
      maxAge: "365d",
      index: false,
      setHeaders: (res) => {
        // Client apps on other origins may show posters in <img>.
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );
  // 5. JSON bodies, at most 100 kB: anything bigger is refused before it is read into memory.
  app.use(express.json({ limit: "100kb" }));

  // 6. Routes. Health and the OpenAPI document first, then the API, then the HTML pages.
  app.use(healthRoutes({ readiness: deps.readiness, checkDatabase: deps.checkDatabase }));
  const openapi = buildOpenApi(routeDocs, version);
  app.get("/openapi.json", (_req, res) => {
    res.json(openapi);
  });

  app.use("/v1", cors(corsOptions(config)), apiLimiter(config.apiRateLimitPerMinute));
  app.use("/v1", authRoutes({ controller: new AuthController(services.auth), auth, authLimiter: authLimiter() }));
  app.use("/v1/me/favorites", favoritesRoutes({ favorites: services.favorites, auth }));
  app.use("/v1/venues", venuesRoutes({ controller: new VenuesController(services.venues), auth }));
  app.use("/v1/events/:eventId/ticket-types", ticketTypesRoutes({ controller: new TicketTypesController(services.ticketTypes), auth }));
  app.use("/v1/events", eventsRoutes({ controller: new EventsController(services.events, loadCalendar()), auth }));
  app.use("/v1/orders", ordersRoutes({ controller: new OrdersController(services.checkout, services.orders), auth }));
  app.use("/v1/organizer", statsRoutes({ stats: services.stats, auth }));
  app.use(pagesRoutes({ controller: new PagesController(services.events, services.ticketTypes) }));

  // 7. Last: anything no route answered, then every error any layer threw.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
