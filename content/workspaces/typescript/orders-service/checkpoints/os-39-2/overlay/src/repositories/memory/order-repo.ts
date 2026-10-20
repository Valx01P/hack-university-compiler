// Orders in a Map, for tests. It keeps the SQLite repository's contract (newest first, keyset
// pages, ids from a sequence), and test/unit/order-repo.test.ts checks both against it.
import { orderIdFor, type OrderId } from "#domain/ids.ts";
import type { Order, OrderStatus, PendingOrder } from "#domain/order.ts";
import { decodeCursor, encodeCursor, isAfter } from "../page.ts";
import type { NewOrder, OrderEventType, OrderRepository, Page, PageRequest } from "../types.ts";

export class MemoryOrderRepository implements OrderRepository {
  readonly #orders = new Map<OrderId, Order>();
  #lastSequence = 0;
  /** The audit trail, in order, so a test can read what was recorded. */
  readonly events: { readonly orderId: OrderId; readonly type: OrderEventType; readonly at: Date }[] = [];

  constructor(orders: readonly Order[] = []) {
    for (const order of orders) {
      this.#orders.set(order.id, order);
      this.#lastSequence = Math.max(this.#lastSequence, Number(order.id.slice(4)));
    }
  }

  findById(id: OrderId): Order | undefined {
    return this.#orders.get(id);
  }

  findAll(page: PageRequest): Page<Order> {
    return pageOf(this.#newestFirst(), page);
  }

  findByStatus(status: OrderStatus, page: PageRequest): Page<Order> {
    return pageOf(
      this.#newestFirst().filter((order) => order.status === status),
      page,
    );
  }

  create(order: NewOrder): Order {
    this.#lastSequence++;
    const created: PendingOrder = { ...order, id: orderIdFor(this.#lastSequence), status: "pending" };
    this.#orders.set(created.id, created);
    return created;
  }

  update(order: Order): void {
    if (!this.#orders.has(order.id)) throw new Error(`No order ${order.id} to update`);
    this.#orders.set(order.id, order);
  }

  recordEvent(orderId: OrderId, type: OrderEventType, at: Date): void {
    this.events.push({ orderId, type, at });
  }

  #newestFirst(): Order[] {
    return [...this.#orders.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
  }
}

function pageOf(sorted: readonly Order[], page: PageRequest): Page<Order> {
  const after = page.cursor === null ? null : decodeCursor(page.cursor);
  if (after === undefined) throw new RangeError(`Not a cursor this service made: ${String(page.cursor)}`);
  const rest = after === null ? sorted : sorted.filter((order) => isAfter(order, after));
  const items = rest.slice(0, page.limit);
  const last = items.at(-1);
  const nextCursor = rest.length > page.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
  return { items, nextCursor };
}
