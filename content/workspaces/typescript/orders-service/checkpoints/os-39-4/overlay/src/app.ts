// The composition root: the one place that builds the object graph. Repositories go into the
// services (with the clock, the events, and the hooks), the services into the controllers,
// and the controllers onto routes. server.ts calls createApp with SQLite, and the HTTP tests
// call it with in-memory repositories, so both run exactly the same routes and rules.
import type { RequestListener } from "node:http";
import type { Clock } from "./clock.ts";
import { healthController } from "#http/controllers/health.ts";
import { orderControllers } from "#http/controllers/orders.ts";
import { productControllers } from "#http/controllers/products.ts";
import { reportControllers } from "#http/controllers/reports.ts";
import { createRequestHandler } from "#http/middleware.ts";
import { createRouter } from "#http/router.ts";
import { queryCounter } from "#repositories/sqlite/query-counter.ts";
import type { Repositories } from "#repositories/types.ts";
import { createOrderEvents, type OrderEvents } from "#services/events.ts";
import { HookRegistry } from "#services/hooks.ts";
import { OrderService } from "#services/order-service.ts";
import { ProductService } from "#services/product-service.ts";
import type { Logger } from "./logger.ts";
import type { DailyReport } from "./reports/daily.ts";

export type AppOptions = {
  readonly repositories: Repositories;
  readonly clock: Clock;
  readonly logger: Logger;
  /** The daily report needs SQL, so only an app on SQLite serves /reports/daily. */
  readonly dailyReport?: (date: string) => DailyReport;
};

export type App = {
  readonly handle: RequestListener;
  readonly orders: OrderService;
  readonly products: ProductService;
  readonly events: OrderEvents;
};

export function createApp(options: AppOptions): App {
  const { repositories, clock, logger } = options;

  const events = createOrderEvents();
  // TODO (lesson 39, part 4): register normalizeNote and limitQuantity.
  const hooks = new HookRegistry();
  const products = new ProductService(repositories.products);
  const orders = new OrderService({ repositories, products, hooks, events, clock });

  // After each committed change: one audit row and one log line.
  events.on("order.created", (order) => {
    repositories.orders.recordEvent(order.id, "order.created", clock.now());
    logger.info("order created", { orderId: order.id });
  });
  events.on("order.paid", (order) => {
    repositories.orders.recordEvent(order.id, "order.paid", clock.now());
    logger.info("order paid", { orderId: order.id });
  });
  events.on("order.shipped", (order) => {
    repositories.orders.recordEvent(order.id, "order.shipped", clock.now());
    logger.info("order shipped", { orderId: order.id, carrier: order.carrier });
  });
  events.on("order.cancelled", (order) => {
    repositories.orders.recordEvent(order.id, "order.cancelled", clock.now());
    logger.info("order cancelled", { orderId: order.id });
  });

  const router = createRouter();
  const health = healthController();
  const orderRoutes = orderControllers(orders);
  const productRoutes = productControllers(products);

  router.get("/health", health.check);
  router.get("/products", productRoutes.list);
  router.get("/products/:sku", productRoutes.get);
  router.get("/products/:sku/availability", productRoutes.availability);
  router.get("/orders", orderRoutes.list);
  router.post("/orders", orderRoutes.create);
  router.get("/orders/:id", orderRoutes.get);
  router.post("/orders/:id/pay", orderRoutes.pay);
  router.post("/orders/:id/ship", orderRoutes.ship);
  router.post("/orders/:id/deliver", orderRoutes.deliver);
  router.post("/orders/:id/cancel", orderRoutes.cancel);
  router.get("/customers/:customerId/orders", orderRoutes.listForCustomer);
  if (options.dailyReport) router.get("/reports/daily", reportControllers(options.dailyReport).daily);

  return { handle: createRequestHandler({ router, logger, queries: queryCounter }), orders, products, events };
}
