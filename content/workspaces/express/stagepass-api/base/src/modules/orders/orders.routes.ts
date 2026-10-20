// Routes for /v1/orders. Every one needs a login, and orders are private, so nothing is cached.
import { Router } from "express";
import { type AuthGuards, requireRole } from "../../http/auth.ts";
import { noStore } from "../../http/cache-control.ts";
import { IdempotencyKey, requireIdempotencyKey } from "../../http/idempotency.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import { validate } from "../../http/validate.ts";
import type { OrdersController } from "./orders.controller.ts";
import { Checkout, ListOrdersQuery, OrderIdParams, OrderPageResponse, OrderResponse } from "./orders.schemas.ts";

export function ordersRoutes({ controller, auth }: { controller: OrdersController; auth: AuthGuards }): Router {
  const router = Router();
  router.use(auth.required, noStore);
  router.post("/", requireRole("customer"), requireIdempotencyKey, validate({ body: Checkout }), controller.checkout);
  router.get("/", validate({ query: ListOrdersQuery }), controller.list);
  router.get("/:orderId", validate({ params: OrderIdParams }), controller.get);
  router.post("/:orderId/cancel", validate({ params: OrderIdParams }), controller.cancel);
  return router;
}

export const ordersDocs: RouteDoc[] = [
  {
    method: "post",
    path: "/v1/orders",
    summary: "Buy tickets for one event",
    tag: "orders",
    auth: "required",
    roles: ["customer"],
    headers: {
      "Idempotency-Key": {
        description: "A new key per purchase, sent again unchanged on retries",
        required: true,
        schema: IdempotencyKey,
      },
    },
    body: { schema: Checkout },
    responses: {
      201: { description: "The paid order. A retry with the same key returns it again with Idempotent-Replayed: true", schema: OrderResponse },
      400: { description: "Invalid items or a missing Idempotency-Key" },
      409: { description: "Sold out, or the event is not on sale" },
      422: { description: "Unknown ticket types, several events, or a key reused for another order" },
    },
  },
  {
    method: "get",
    path: "/v1/orders",
    summary: "Your orders, newest first",
    tag: "orders",
    auth: "required",
    query: ListOrdersQuery,
    responses: { 200: { description: "One page of your orders", schema: OrderPageResponse }, 400: { description: "Bad cursor or limit" } },
  },
  {
    method: "get",
    path: "/v1/orders/{orderId}",
    summary: "One of your orders",
    tag: "orders",
    auth: "required",
    params: OrderIdParams,
    responses: { 200: { description: "The order", schema: OrderResponse }, 404: { description: "No such order of yours" } },
  },
  {
    method: "post",
    path: "/v1/orders/{orderId}/cancel",
    summary: "Cancel an order before its event starts",
    tag: "orders",
    auth: "required",
    params: OrderIdParams,
    responses: {
      200: { description: "The cancelled order", schema: OrderResponse },
      404: { description: "No such order of yours" },
      409: { description: "Already cancelled, or the event has started" },
    },
  },
];
