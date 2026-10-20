// The order controllers. Each one parses its input (path params, the query string, the JSON
// body), calls one OrderService method, and presents the result through the view. There are
// no business rules and no SQL here, so the service could be called from a CLI or a queue
// just the same.
import type { ServerResponse } from "node:http";
import type { DomainError } from "#domain/errors.ts";
import { isOrderId, type OrderId } from "#domain/ids.ts";
import type { Order } from "#domain/order.ts";
import type { Result } from "#domain/result.ts";
import { CancelBody, CreateOrderBody, OrderListQuery, PayBody, ShipBody } from "#schemas/orders.ts";
import type { OrderService } from "#services/order-service.ts";
import type { RequestContext } from "../context.ts";
import { HttpError, sendDomainError } from "../errors.ts";
import { json } from "../respond.ts";
import { parseBody, parseQuery } from "../validate.ts";
import { presentOrder } from "../views/order-view.ts";

/** An id that cannot belong to any order is simply not found. */
function orderIdFrom(text: string): OrderId {
  if (!isOrderId(text)) throw new HttpError(404, `No order with id ${text}`);
  return text;
}

function sendOrder(res: ServerResponse, result: Result<Order, DomainError>): void {
  if (result.ok) json(res, 200, presentOrder(result.value));
  else sendDomainError(res, result.error);
}

export function orderControllers(orders: OrderService) {
  return {
    list: (ctx: RequestContext) => {
      const query = parseQuery(OrderListQuery, ctx.query);
      const page = orders.listOrders({ limit: query.limit, cursor: query.cursor ?? null, ...(query.status ? { status: query.status } : {}) });
      json(ctx.res, 200, { items: page.items.map(presentOrder), nextCursor: page.nextCursor });
    },

    get: (ctx: RequestContext<{ readonly id: string }>) => {
      sendOrder(ctx.res, orders.getOrder(orderIdFrom(ctx.params.id)));
    },

    create: async (ctx: RequestContext) => {
      const body = parseBody(CreateOrderBody, await ctx.readJson());
      const created = orders.createOrder(body);
      if (!created.ok) {
        sendDomainError(ctx.res, created.error);
        return;
      }
      json(ctx.res, 201, presentOrder(created.value), { location: `/orders/${created.value.id}` });
    },

    pay: async (ctx: RequestContext<{ readonly id: string }>) => {
      const id = orderIdFrom(ctx.params.id);
      const body = parseBody(PayBody, await ctx.readJson());
      sendOrder(ctx.res, orders.pay(id, body.paymentRef));
    },

    ship: async (ctx: RequestContext<{ readonly id: string }>) => {
      const id = orderIdFrom(ctx.params.id);
      const body = parseBody(ShipBody, await ctx.readJson());
      sendOrder(ctx.res, orders.ship(id, body));
    },

    deliver: (ctx: RequestContext<{ readonly id: string }>) => {
      sendOrder(ctx.res, orders.deliver(orderIdFrom(ctx.params.id)));
    },

    cancel: async (ctx: RequestContext<{ readonly id: string }>) => {
      const id = orderIdFrom(ctx.params.id);
      const body = parseBody(CancelBody, await ctx.readJson());
      sendOrder(ctx.res, orders.cancel(id, body.reason));
    },
  };
}
