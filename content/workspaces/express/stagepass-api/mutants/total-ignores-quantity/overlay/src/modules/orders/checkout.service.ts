// Checkout: turns a cart into a paid order, all or nothing, in one transaction.
//
// - Seats are taken with an atomic conditional update (ticketTypesRepository.reserve), never by
//   reading `sold` and writing it back, so concurrent buyers cannot oversell the last seat.
// - Items are taken in ticket type id order, so two carts with the same types lock their rows
//   in the same order and queue up instead of deadlocking. withTx retries the rare deadlock left.
// - The Idempotency-Key makes retries safe: the same key returns the order it already made.
import { now } from "../../clock.ts";
import { type Db, pgConstraint, pgErrorCode, type RaceWindow, type Tx, withTx } from "../../db/tx.ts";
import type { HookRegistry } from "../../hooks/registry.ts";
import type { AuthUser } from "../../http/auth.ts";
import { AppError, EventNotOnSaleError, SoldOutError, UnprocessableError, ValidationError } from "../../http/errors.ts";
import { toFieldErrors } from "../../http/validate.ts";
import type { TicketTypesRepository } from "../ticket-types/ticket-types.repository.ts";
import { Checkout } from "./orders.schemas.ts";
import type { OrderDetail, OrdersRepository } from "./orders.repository.ts";

export type CheckoutDeps = {
  db: Db;
  ticketTypes: TicketTypesRepository;
  orders: OrdersRepository;
  hooks: HookRegistry;
  /** A pause between reading and writing, for concurrency checks (HU_RACE_DELAY_MS). */
  raceWindow?: RaceWindow;
};

export type CheckoutResult = { order: OrderDetail; replayed: boolean };

function sameItems(order: OrderDetail, input: Checkout): boolean {
  const asText = (items: Array<{ ticketTypeId: number; quantity: number }>) =>
    items
      .map((item) => `${item.ticketTypeId}x${item.quantity}`)
      .sort()
      .join(",");
  return asText(order.items) === asText(input.items);
}

export class CheckoutService {
  readonly #deps: Required<CheckoutDeps>;

  constructor(deps: CheckoutDeps) {
    this.#deps = { raceWindow: async () => {}, ...deps };
  }

  async checkout(customer: AuthUser, cart: Checkout, idempotencyKey: string): Promise<CheckoutResult> {
    const { db, orders } = this.#deps;
    // The route validated already, but the rules hold for every caller, scripts and tests included.
    const parsed = Checkout.safeParse(cart);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error, "body"));
    const input = parsed.data;

    const previous = await orders.findByIdempotencyKey(db, customer.id, idempotencyKey);
    if (previous !== null) return this.#replay(previous, input);

    try {
      const orderId = await withTx(db, (tx) => this.#place(tx, customer, input, idempotencyKey));
      const order = await orders.findById(db, orderId);
      if (order === null) throw new Error(`Order ${orderId} is missing right after checkout`);
      return { order, replayed: false };
    } catch (err) {
      // Two requests with one key at the same moment: the unique constraint let exactly one insert win.
      if (pgErrorCode(err) === "23505" && pgConstraint(err) === "orders_customer_id_idempotency_key_unique") {
        const winner = await orders.findByIdempotencyKey(db, customer.id, idempotencyKey);
        if (winner !== null) return this.#replay(winner, input);
      }
      throw err;
    }
  }

  async #place(tx: Tx, customer: AuthUser, input: Checkout, idempotencyKey: string): Promise<number> {
    const { ticketTypes, orders, hooks, raceWindow } = this.#deps;
    const items = [...input.items].sort((a, b) => a.ticketTypeId - b.ticketTypeId);
    const forSale = new Map((await ticketTypes.listForSale(tx, items.map((item) => item.ticketTypeId))).map((t) => [t.id, t]));

    const missing = items.filter((item) => !forSale.has(item.ticketTypeId));
    if (missing.length > 0) {
      throw new UnprocessableError(missing.map((item) => ({ field: "items", message: `No ticket type with id ${item.ticketTypeId}` })));
    }
    const events = new Map([...forSale.values()].map((ticketType) => [ticketType.event.id, ticketType.event]));
    if (events.size > 1) {
      throw new UnprocessableError([{ field: "items", message: "Every ticket in one order must be for the same event" }]);
    }
    const [event] = events.values();
    if (event === undefined) throw new Error("A checkout with items has an event");
    if (event.status !== "published") {
      throw new EventNotOnSaleError(event.id, event.status === "draft" ? "it is not published yet" : "it was cancelled");
    }
    if (event.startsAt <= now()) throw new EventNotOnSaleError(event.id, "it has already started");

    await raceWindow("checkout.reserve");

    const lines = [];
    for (const item of items) {
      const reserved = await ticketTypes.reserve(tx, item.ticketTypeId, item.quantity);
      if (reserved === null) throw new SoldOutError(forSale.get(item.ticketTypeId) ?? { id: item.ticketTypeId, name: "ticket" });
      // The price from the row just locked, so the order charges what the database holds now.
      lines.push({ ticketTypeId: item.ticketTypeId, quantity: item.quantity, unitPriceCents: reserved.priceCents });
    }
    const totalCents = lines.reduce((sum, line) => sum + line.unitPriceCents, 0);

    const { order, items: created } = await orders.create(
      tx,
      { customerId: customer.id, eventId: event.id, totalCents, idempotencyKey, paidAt: now() },
      lines,
    );
    await hooks.run("order.paid", { order, items: created, actor: customer }, tx);
    return order.id;
  }

  #replay(previous: OrderDetail, input: Checkout): CheckoutResult {
    if (!sameItems(previous, input)) {
      throw new AppError(422, "Unprocessable Content", "This Idempotency-Key was already used for a different order", {
        type: "idempotency-key-reused",
        extra: { orderId: previous.id },
      });
    }
    return { order: previous, replayed: true };
  }
}
