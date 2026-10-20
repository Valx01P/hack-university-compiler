// The business rules for orders: what may happen to an order and when, and the hooks and
// events around each change. It talks only to repository interfaces, the clock, and the event
// emitter, so the same code runs on SQLite in the server and on the in-memory repositories
// in the tests.
import type { Clock } from "../clock.ts";
import { invalidTransition, notFound, validation, type DomainError } from "#domain/errors.ts";
import type { CustomerId, OrderId, Sku } from "#domain/ids.ts";
import { cancel, deliver, pay, ship, type CancelledOrder, type Carrier, type DeliveredOrder, type Order, type OrderStatus, type PaidOrder, type ShippedOrder } from "#domain/order.ts";
import { err, ok, type Result } from "#domain/result.ts";
import type { CustomerRepository, OrderRepository, Page, Repositories, Transaction } from "#repositories/types.ts";
import type { OrderEvents } from "./events.ts";
import type { HookRegistry, OrderDraft } from "./hooks.ts";
import type { ProductService } from "./product-service.ts";

export type CreateOrderInput = {
  readonly customerId: CustomerId;
  readonly lines: readonly { readonly sku: Sku; readonly quantity: number }[];
  // zod's .optional() gives string | undefined, so the input says so too.
  readonly note?: string | undefined;
};

export type OrderQuery = {
  readonly status?: OrderStatus;
  readonly limit: number;
  readonly cursor: string | null;
};

export type OrderServiceDeps = {
  readonly repositories: Repositories;
  readonly products: ProductService;
  readonly hooks: HookRegistry;
  readonly events: OrderEvents;
  readonly clock: Clock;
};

/** Thrown inside a transaction to roll it back, and turned back into the Result outside it. */
class Rollback extends Error {
  readonly reason: DomainError;

  constructor(reason: DomainError) {
    super(`rolled back: ${reason.type}`);
    this.reason = reason;
  }
}

export class OrderService {
  readonly #orders: OrderRepository;
  readonly #customers: CustomerRepository;
  readonly #transaction: Transaction;
  readonly #products: ProductService;
  readonly #hooks: HookRegistry;
  readonly #events: OrderEvents;
  readonly #clock: Clock;

  constructor(deps: OrderServiceDeps) {
    this.#orders = deps.repositories.orders;
    this.#customers = deps.repositories.customers;
    this.#transaction = deps.repositories.transaction;
    this.#products = deps.products;
    this.#hooks = deps.hooks;
    this.#events = deps.events;
    this.#clock = deps.clock;
  }

  createOrder(input: CreateOrderInput): Result<Order, DomainError> {
    if (!this.#customers.findById(input.customerId)) return err(validation("customerId", `No customer with id ${input.customerId}`));
    const lines = this.#products.priceLines(input.lines);
    if (!lines.ok) return lines;
    const draft: OrderDraft = { customerId: input.customerId, lines: lines.value, note: input.note ?? null };
    const created = this.#atomically(() => {
      // Hooks run inside the transaction, just before the write, so what they check is what
      // gets stored.
      const hooked = this.#hooks.runBeforeCreateOrder(draft);
      if (!hooked.ok) return hooked;
      const reserved = this.#products.reserveStock(hooked.value.lines);
      if (!reserved.ok) return reserved;
      return ok(this.#orders.create({ ...hooked.value, createdAt: this.#clock.now() }));
    });
    if (created.ok) this.#events.emit("order.created", created.value);
    return created;
  }

  getOrder(id: OrderId): Result<Order, DomainError> {
    const order = this.#orders.findById(id);
    return order ? ok(order) : err(notFound("order", id));
  }

  listOrders(query: OrderQuery): Page<Order> {
    const page = { limit: query.limit, cursor: query.cursor };
    return query.status === undefined ? this.#orders.findAll(page) : this.#orders.findByStatus(query.status, page);
  }

  listForCustomer(customerId: CustomerId): Result<readonly Order[], DomainError> {
    if (!this.#customers.findById(customerId)) return err(notFound("customer", customerId));
    return ok(this.#orders.listByCustomer(customerId));
  }

  // Each transition below finds the order, checks it is in the state the domain function
  // takes (pay() only accepts a PendingOrder), applies the rule, saves, and then tells the
  // listeners.

  pay(id: OrderId, paymentRef: string): Result<PaidOrder, DomainError> {
    const order = this.#orders.findById(id);
    if (!order) return err(notFound("order", id));
    if (order.status !== "pending") return err(invalidTransition(order.status, "paid"));
    const paid = pay(order, paymentRef, this.#clock.now());
    if (!paid.ok) return paid;
    this.#orders.update(paid.value);
    this.#events.emit("order.paid", paid.value);
    return paid;
  }

  ship(id: OrderId, shipment: { readonly carrier: Carrier; readonly trackingNumber: string }): Result<ShippedOrder, DomainError> {
    const order = this.#orders.findById(id);
    if (!order) return err(notFound("order", id));
    if (order.status !== "paid") return err(invalidTransition(order.status, "shipped"));
    const shipped = ship(order, shipment, this.#clock.now());
    if (!shipped.ok) return shipped;
    this.#orders.update(shipped.value);
    this.#events.emit("order.shipped", shipped.value);
    return shipped;
  }

  deliver(id: OrderId): Result<DeliveredOrder, DomainError> {
    const order = this.#orders.findById(id);
    if (!order) return err(notFound("order", id));
    if (order.status !== "shipped") return err(invalidTransition(order.status, "delivered"));
    const delivered = deliver(order, this.#clock.now());
    if (delivered.ok) this.#orders.update(delivered.value);
    return delivered;
  }

  cancel(id: OrderId, reason: string): Result<CancelledOrder, DomainError> {
    const order = this.#orders.findById(id);
    if (!order) return err(notFound("order", id));
    // Only an order that has not left the roastery can be cancelled.
    if (order.status !== "pending" && order.status !== "paid") return err(invalidTransition(order.status, "cancelled"));
    const cancelled = cancel(order, reason, this.#clock.now());
    if (!cancelled.ok) return cancelled;
    this.#orders.update(cancelled.value);
    return cancelled;
  }

  /** Runs work in a transaction that commits only when work succeeds. */
  #atomically<T>(work: () => Result<T, DomainError>): Result<T, DomainError> {
    try {
      return this.#transaction(() => {
        const result = work();
        if (!result.ok) throw new Rollback(result.error);
        return result;
      });
    } catch (error) {
      if (error instanceof Rollback) return err(error.reason);
      throw error;
    }
  }
}
