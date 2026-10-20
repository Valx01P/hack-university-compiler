// Orders in SQLite. Every row goes through the schemas in rows.ts, and every statement is
// counted (query-counter.ts). A page of orders takes two statements however long it is: one
// for the orders, and one for all of their lines.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import * as z from "zod";
import { orderIdFor, type CustomerId, type OrderId } from "#domain/ids.ts";
import type { Order, PendingOrder } from "#domain/order.ts";
import { decodeCursor, encodeCursor } from "../page.ts";
import type { NewOrder, OrderEventType, OrderRepository, Page, PageRequest } from "../types.ts";
import { countQuery } from "./query-counter.ts";
import { LineRow, OrderRow, toOrder } from "./rows.ts";

const LastSequence = z.object({ last: z.number().int().nullable() });

export class SqliteOrderRepository implements OrderRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  findById(id: OrderId): Order | undefined {
    countQuery();
    const row = this.#db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    return row === undefined ? undefined : this.#withLines([OrderRow.parse(row)])[0];
  }

  findAll(page: PageRequest): Page<Order> {
    return this.#page(null, [], page);
  }

  listByCustomer(customerId: CustomerId): readonly Order[] {
    countQuery();
    const rows = this.#db.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC").all(customerId);
    return this.#withLines(rows.map((row) => OrderRow.parse(row)));
  }

  create(order: NewOrder): Order {
    countQuery();
    // The next id comes from the database, inside the caller's transaction, so two orders
    // can never get the same number.
    const { last } = LastSequence.parse(this.#db.prepare("SELECT MAX(CAST(substr(id, 5) AS INTEGER)) AS last FROM orders").get());
    const created: PendingOrder = { ...order, id: orderIdFor((last ?? 0) + 1), status: "pending" };
    countQuery();
    this.#db
      .prepare("INSERT INTO orders (id, customer_id, status, note, created_at) VALUES (?, ?, 'pending', ?, ?)")
      .run(created.id, created.customerId, created.note, created.createdAt.toISOString());
    const insertLine = this.#db.prepare("INSERT INTO order_lines (order_id, line_no, sku, name, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)");
    created.lines.forEach((line, index) => {
      countQuery();
      insertLine.run(created.id, index + 1, line.sku, line.name, line.quantity, line.unitPriceCents);
    });
    return created;
  }

  update(order: Order): void {
    countQuery();
    const columns = stateColumns(order);
    const result = this.#db
      .prepare(
        `UPDATE orders SET status = ?, paid_at = ?, payment_ref = ?, shipped_at = ?, carrier = ?, tracking_number = ?,
           delivered_at = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?`,
      )
      .run(order.status, ...columns, order.id);
    if (result.changes !== 1) throw new Error(`No order ${order.id} to update`);
  }

  recordEvent(orderId: OrderId, type: OrderEventType, at: Date): void {
    countQuery();
    this.#db.prepare("INSERT INTO order_events (order_id, type, at) VALUES (?, ?, ?)").run(orderId, type, at.toISOString());
  }

  #page(where: string | null, params: readonly SQLInputValue[], page: PageRequest): Page<Order> {
    const after = page.cursor === null ? null : decodeCursor(page.cursor);
    if (after === undefined) throw new RangeError(`Not a cursor this service made: ${String(page.cursor)}`);
    const conditions = [where, after && "(created_at < ? OR (created_at = ? AND id < ?))"].filter((c) => typeof c === "string");
    const sql = `SELECT * FROM orders ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC LIMIT ?`;
    countQuery();
    // One row more than the page holds tells us whether there is a next page.
    const rows = this.#db
      .prepare(sql)
      .all(...params, ...(after ? [after.createdAt, after.createdAt, after.id] : []), page.limit + 1)
      .map((row) => OrderRow.parse(row));
    const items = this.#withLines(rows.slice(0, page.limit));
    const last = items.at(-1);
    const nextCursor = rows.length > page.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return { items, nextCursor };
  }

  /** Loads the lines of all the rows' orders with one IN (...) query and builds each order. */
  #withLines(rows: readonly OrderRow[]): Order[] {
    if (rows.length === 0) return [];
    countQuery();
    const placeholders = rows.map(() => "?").join(", ");
    const lines = this.#db
      .prepare(`SELECT * FROM order_lines WHERE order_id IN (${placeholders}) ORDER BY order_id, line_no`)
      .all(...rows.map((row) => row.id))
      .map((line) => LineRow.parse(line));
    const byOrder = Map.groupBy(lines, (line) => line.orderId);
    return rows.map((row) => toOrder(row, (byOrder.get(row.id) ?? []).map((entry) => entry.line)));
  }
}

/** The columns that depend on the state, in the order the UPDATE above lists them. */
function stateColumns(order: Order): SQLInputValue[] {
  const time = (date: Date | null): string | null => (date === null ? null : date.toISOString());
  switch (order.status) {
    case "pending":
      return [null, null, null, null, null, null, null, null];
    case "paid":
      return [time(order.paidAt), order.paymentRef, null, null, null, null, null, null];
    case "shipped":
      return [time(order.paidAt), order.paymentRef, time(order.shippedAt), order.carrier, order.trackingNumber, null, null, null];
    case "delivered":
      return [time(order.paidAt), order.paymentRef, time(order.shippedAt), order.carrier, order.trackingNumber, time(order.deliveredAt), null, null];
    case "cancelled":
      return [time(order.paidAt), order.paymentRef, null, null, null, null, time(order.cancelledAt), order.cancelReason];
  }
}
