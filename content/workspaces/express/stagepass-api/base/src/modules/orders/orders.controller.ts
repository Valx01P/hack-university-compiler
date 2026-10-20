// The controller for orders.
import type { RequestHandler } from "express";
import { currentUser } from "../../http/auth.ts";
import type { CheckoutService } from "./checkout.service.ts";
import type { Checkout, ListOrdersQuery, OrderIdParams } from "./orders.schemas.ts";
import type { OrdersService } from "./orders.service.ts";
import { toOrderJson, toOrderSummaryJson } from "./orders.view.ts";

export class OrdersController {
  readonly #checkout: CheckoutService;
  readonly #orders: OrdersService;

  constructor(checkout: CheckoutService, orders: OrdersService) {
    this.#checkout = checkout;
    this.#orders = orders;
  }

  checkout: RequestHandler = async (req, res) => {
    const key = res.locals.idempotencyKey as string;
    const { order, replayed } = await this.#checkout.checkout(currentUser(req), req.body as Checkout, key);
    // A retry gets the first answer again, marked so clients and logs can tell.
    if (replayed) res.set("Idempotent-Replayed", "true");
    res.status(201).location(`/v1/orders/${order.id}`).json(toOrderJson(order));
  };

  list: RequestHandler = async (req, res) => {
    const page = await this.#orders.list(currentUser(req), res.locals.query as ListOrdersQuery);
    res.json({ data: page.data.map(toOrderSummaryJson), nextCursor: page.nextCursor });
  };

  get: RequestHandler = async (req, res) => {
    const { orderId } = res.locals.params as OrderIdParams;
    res.json(toOrderJson(await this.#orders.get(currentUser(req), orderId)));
  };

  cancel: RequestHandler = async (req, res) => {
    const { orderId } = res.locals.params as OrderIdParams;
    res.json(toOrderJson(await this.#orders.cancel(currentUser(req), orderId)));
  };
}
