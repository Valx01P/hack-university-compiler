// Reading and cancelling orders. Customers only ever reach their own: the queries are scoped
// by customer, so another customer's order id answers 404, exactly like an id that does not exist.
import { z } from "zod";
import { now } from "../../clock.ts";
import { type Db, withTx } from "../../db/tx.ts";
import type { HookRegistry } from "../../hooks/registry.ts";
import type { AuthUser } from "../../http/auth.ts";
import { ConflictError, NotFoundError } from "../../http/errors.ts";
import { decodeCursor, type Page, toPage } from "../../http/pagination.ts";
import type { EventsRepository } from "../events/events.repository.ts";
import type { TicketTypesRepository } from "../ticket-types/ticket-types.repository.ts";
import type { ListOrdersQuery } from "./orders.schemas.ts";
import { canCancelOrder, canViewOrder } from "./orders.policy.ts";
import type { OrderDetail, OrderSummary, OrdersRepository } from "./orders.repository.ts";

export type OrdersServiceDeps = {
  db: Db;
  orders: OrdersRepository;
  events: EventsRepository;
  ticketTypes: TicketTypesRepository;
  hooks: HookRegistry;
};

const SORT = "-createdAt";

export class OrdersService {
  readonly #deps: OrdersServiceDeps;

  constructor(deps: OrdersServiceDeps) {
    this.#deps = deps;
  }

  /** Your orders, newest first, one cursor page at a time. */
  async list(user: AuthUser, query: ListOrdersQuery): Promise<Page<OrderSummary>> {
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor, { sort: SORT, key: z.iso.datetime() });
    const rows = await this.#deps.orders.listForCustomer(this.#deps.db, user.id, {
      after: cursor === undefined ? undefined : { createdAt: new Date(cursor.key), id: cursor.id },
      limit: query.limit + 1,
    });
    return toPage(rows, query.limit, (order) => ({ sort: SORT, key: order.createdAt.toISOString(), id: order.id }));
  }

  async get(user: AuthUser, orderId: number): Promise<OrderDetail> {
    const { db, orders } = this.#deps;
    const order =
      user.role === "admin" ? await orders.findById(db, orderId) : await orders.findForCustomer(db, user.id, orderId);
    if (order === null || !canViewOrder(user, order)) throw new NotFoundError(`No order with id ${orderId}`);
    return order;
  }

  /** Cancels a paid order before its event starts and gives the seats back, in one transaction. */
  async cancel(user: AuthUser, orderId: number): Promise<OrderDetail> {
    const { db, orders, events, ticketTypes, hooks } = this.#deps;
    await withTx(db, async (tx) => {
      // The row lock makes a second, simultaneous cancel wait, then see "cancelled" and stop.
      const order = await orders.lockById(tx, orderId);
      if (order === null || !canCancelOrder(user, order)) throw new NotFoundError(`No order with id ${orderId}`);
      if (order.status === "cancelled") throw new ConflictError("order-cancelled", "This order is already cancelled");
      const event = await events.findById(tx, order.eventId);
      if (event === null || event.startsAt <= now()) {
        throw new ConflictError("event-started", "Orders cannot be cancelled once the event has started");
      }
      const items = await orders.itemsOf(tx, orderId);
      for (const item of items) await ticketTypes.release(tx, item.ticketTypeId, item.quantity);
      const cancelled = await orders.markCancelled(tx, orderId, now());
      await hooks.run("order.cancelled", { order: cancelled, items, actor: user }, tx);
    });
    return this.get(user, orderId);
  }
}
