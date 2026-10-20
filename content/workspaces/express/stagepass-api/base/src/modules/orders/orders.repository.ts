// Every query on orders and order_items. Lookups that a customer makes are scoped by
// customer_id in SQL (findForCustomer), so someone else's order is simply not found.
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { events, orderItems, orders, ticketTypes } from "../../db/schema.ts";
import type { DbOrTx, Tx } from "../../db/tx.ts";

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrder = Pick<Order, "customerId" | "eventId" | "totalCents" | "idempotencyKey" | "paidAt">;
export type NewOrderItem = Pick<OrderItem, "ticketTypeId" | "quantity" | "unitPriceCents">;

export type OrderItemDetail = OrderItem & { ticketTypeName: string };
export type OrderDetail = Order & {
  event: { id: number; title: string; slug: string; startsAt: Date };
  items: OrderItemDetail[];
};

/** One row of "my orders": only what the list shows. */
export type OrderSummary = Pick<Order, "id" | "status" | "eventId" | "totalCents" | "createdAt" | "paidAt" | "cancelledAt"> & {
  eventTitle: string;
  eventStartsAt: Date;
  ticketCount: number;
};

export interface OrdersRepository {
  findByIdempotencyKey(db: DbOrTx, customerId: number, key: string): Promise<OrderDetail | null>;
  create(tx: Tx, order: NewOrder, items: NewOrderItem[]): Promise<{ order: Order; items: OrderItem[] }>;
  findById(db: DbOrTx, id: number): Promise<OrderDetail | null>;
  findForCustomer(db: DbOrTx, customerId: number, orderId: number): Promise<OrderDetail | null>;
  /** Locks the order row until the transaction ends, so it cannot be cancelled twice at once. */
  lockById(tx: Tx, id: number): Promise<Order | null>;
  itemsOf(db: DbOrTx, orderId: number): Promise<OrderItem[]>;
  /** Newest first. `after` is the last row of the previous page. Returns up to `limit` rows. */
  listForCustomer(
    db: DbOrTx,
    customerId: number,
    page: { after?: { createdAt: Date; id: number } | undefined; limit: number },
  ): Promise<OrderSummary[]>;
  markCancelled(tx: Tx, id: number, at: Date): Promise<Order>;
  /** Cancels every paid order of an event and returns them. */
  cancelPaidForEvent(tx: Tx, eventId: number, at: Date): Promise<Order[]>;
}

async function withDetails(db: DbOrTx, where: SQL | undefined): Promise<OrderDetail | null> {
  const [row] = await db
    .select({ order: orders, event: { id: events.id, title: events.title, slug: events.slug, startsAt: events.startsAt } })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(where);
  if (row === undefined) return null;
  const items = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      ticketTypeId: orderItems.ticketTypeId,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      ticketTypeName: ticketTypes.name,
    })
    .from(orderItems)
    .innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
    .where(eq(orderItems.orderId, row.order.id))
    .orderBy(asc(orderItems.ticketTypeId));
  return { ...row.order, event: row.event, items };
}

export const ordersRepository: OrdersRepository = {
  findByIdempotencyKey(db, customerId, key) {
    return withDetails(db, and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, key)));
  },

  async create(tx, order, items) {
    const [created] = await tx.insert(orders).values(order).returning();
    if (created === undefined) throw new Error("INSERT INTO orders returned no row");
    const createdItems = await tx
      .insert(orderItems)
      .values(items.map((item) => ({ ...item, orderId: created.id })))
      .returning();
    return { order: created, items: createdItems };
  },

  findById(db, id) {
    return withDetails(db, eq(orders.id, id));
  },

  findForCustomer(db, customerId, orderId) {
    return withDetails(db, and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  },

  async lockById(tx, id) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    return order ?? null;
  },

  async itemsOf(db, orderId) {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.ticketTypeId));
  },

  async listForCustomer(db, customerId, { after, limit }) {
    return (
      db
        .select({
          id: orders.id,
          status: orders.status,
          eventId: orders.eventId,
          totalCents: orders.totalCents,
          createdAt: orders.createdAt,
          paidAt: orders.paidAt,
          cancelledAt: orders.cancelledAt,
          eventTitle: events.title,
          eventStartsAt: events.startsAt,
          ticketCount: sql<number>`(select coalesce(sum(${orderItems.quantity}), 0) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`.mapWith(Number),
        })
        .from(orders)
        .innerJoin(events, eq(events.id, orders.eventId))
        .where(
          and(
            eq(orders.customerId, customerId),
            // Newest first, so the next page holds rows that sort before the cursor's row.
            after === undefined ? undefined : sql`(${orders.createdAt}, ${orders.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id})`,
          ),
        )
        // The same order as the index orders_customer_idx, so PostgreSQL reads it and stops at limit.
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(limit)
    );
  },

  async markCancelled(tx, id, at) {
    const [order] = await tx.update(orders).set({ status: "cancelled", cancelledAt: at }).where(eq(orders.id, id)).returning();
    if (order === undefined) throw new Error(`Order ${id} vanished during an update`);
    return order;
  },

  async cancelPaidForEvent(tx, eventId, at) {
    return tx
      .update(orders)
      .set({ status: "cancelled", cancelledAt: at })
      .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")))
      .returning();
  },
};
