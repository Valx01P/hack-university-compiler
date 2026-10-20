// The persistence boundary. Services depend on these interfaces, never on SQLite, and there are
// two implementations: sqlite/ for the running service and memory/ for fast tests. One
// contract test (test/unit/order-repo.test.ts) runs against both, so they stay
// interchangeable.
import type { Customer } from "#domain/customer.ts";
import type { CustomerId, OrderId, Sku } from "#domain/ids.ts";
import type { Order, OrderLine, OrderStatus } from "#domain/order.ts";
import type { Product } from "#domain/product.ts";

/** A page request: at most limit items, starting after the cursor (null for the first page). */
export type PageRequest = { readonly limit: number; readonly cursor: string | null };

/** One page, and the cursor for the next one (null when this is the last). */
export type Page<T> = { readonly items: readonly T[]; readonly nextCursor: string | null };

/** Everything about a new order but its id, which the repository assigns. */
export type NewOrder = {
  readonly customerId: CustomerId;
  readonly lines: readonly OrderLine[];
  readonly note: string | null;
  readonly createdAt: Date;
};

export type OrderEventType = "order.created" | "order.paid" | "order.shipped" | "order.cancelled";

export interface OrderRepository {
  findById(id: OrderId): Order | undefined;
  /** Every order, newest first. */
  findAll(page: PageRequest): Page<Order>;
  /** The orders in one status, newest first. */
  findByStatus(status: OrderStatus, page: PageRequest): Page<Order>;
  /** All of one customer's orders, newest first. */
  listByCustomer(customerId: CustomerId): readonly Order[];
  /** Stores a new pending order with the next id (ord_0013 after ord_0012). */
  create(order: NewOrder): Order;
  update(order: Order): void;
  /** Appends a row to the audit trail. */
  recordEvent(orderId: OrderId, type: OrderEventType, at: Date): void;
}

export interface ProductRepository {
  list(): readonly Product[];
  findBySku(sku: Sku): Product | undefined;
  findMany(skus: readonly Sku[]): readonly Product[];
  /** Takes quantity off the shelf. false means there were not enough left. */
  decrementStock(sku: Sku, quantity: number): boolean;
}

export interface CustomerRepository {
  findById(id: CustomerId): Customer | undefined;
}

/** Runs work so that all its writes happen or none do. */
export type Transaction = <T>(work: () => T) => T;

export type Repositories = {
  readonly orders: OrderRepository;
  readonly products: ProductRepository;
  readonly customers: CustomerRepository;
  readonly transaction: Transaction;
};
