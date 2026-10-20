// CheckoutService with in-memory fakes: the rules of buying tickets, no database needed.
import { describe, expect, it, vi } from "vitest";
import { HookRegistry } from "../../src/hooks/registry.ts";
import { AppError, EventNotOnSaleError, SoldOutError, UnprocessableError, ValidationError } from "../../src/http/errors.ts";
import { CheckoutService } from "../../src/modules/orders/checkout.service.ts";
import { emptyStore, makeFakes } from "../support/fakes.ts";
import { makeEvent, makeTicketType, makeUser, makeVenue } from "../support/factories.ts";
import { as } from "../support/tokens.ts";

function setup() {
  const store = emptyStore();
  store.users.push(makeUser({ id: 4, role: "customer" }));
  store.venues.push(makeVenue({ id: 1 }));
  store.events.push(makeEvent({ id: 1 }), makeEvent({ id: 2, status: "draft" }), makeEvent({ id: 3 }));
  store.ticketTypes.push(
    makeTicketType({ id: 10, eventId: 1, name: "General", priceCents: 2500, capacity: 100, sold: 0 }),
    makeTicketType({ id: 11, eventId: 1, name: "VIP", priceCents: 8000, capacity: 2, sold: 1 }),
    makeTicketType({ id: 12, eventId: 1, name: "Balcony", priceCents: 1500, capacity: 40 }),
    makeTicketType({ id: 13, eventId: 1, name: "Standing", priceCents: 1000, capacity: 40 }),
    makeTicketType({ id: 20, eventId: 2, name: "General", priceCents: 1000, capacity: 50 }),
    makeTicketType({ id: 30, eventId: 3, name: "General", priceCents: 1000, capacity: 50 }),
  );
  const fakes = makeFakes(store);
  const hooks = new HookRegistry();
  const checkout = new CheckoutService({
    db: fakes.db,
    ticketTypes: fakes.repositories.ticketTypes,
    orders: fakes.repositories.orders,
    hooks,
  });
  const sold = (id: number) => store.ticketTypes.find((t) => t.id === id)?.sold;
  return { store, fakes, hooks, checkout, sold };
}

describe("CheckoutService.checkout", () => {
  it("creates a paid order, charges quantity times price, and sells the seats", async () => {
    const { checkout, sold, store } = setup();
    const { order, replayed } = await checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 3 }, { ticketTypeId: 11, quantity: 1 }] }, "key-0000001");

    expect(replayed).toBe(false);
    expect(order).toMatchObject({ status: "paid", customerId: 4, eventId: 1, totalCents: 3 * 2500 + 8000 });
    expect(order.items.map((item) => [item.ticketTypeName, item.quantity, item.unitPriceCents])).toEqual([
      ["General", 3, 2500],
      ["VIP", 1, 8000],
    ]);
    expect([sold(10), sold(11)]).toEqual([3, 2]);
    expect(store.orders).toHaveLength(1);
  });

  it("throws SoldOutError when a ticket type has too few seats left, and sells nothing", async () => {
    const { checkout, sold, store } = setup();
    const attempt = checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 2 }, { ticketTypeId: 11, quantity: 2 }] }, "key-0000002");

    await expect(attempt).rejects.toBeInstanceOf(SoldOutError);
    // The General seats reserved first were rolled back with the transaction.
    expect([sold(10), sold(11)]).toEqual([0, 1]);
    expect(store.orders).toEqual([]);
  });

  it.each([
    ["a quantity of 0", { items: [{ ticketTypeId: 10, quantity: 0 }] }],
    ["more than 10 of one type", { items: [{ ticketTypeId: 10, quantity: 11 }] }],
    ["no items", { items: [] }],
    ["more than 4 items", { items: [1, 2, 3, 4, 5].map((n) => ({ ticketTypeId: n, quantity: 1 })) }],
    ["the same type twice", { items: [{ ticketTypeId: 10, quantity: 1 }, { ticketTypeId: 10, quantity: 1 }] }],
  ])("refuses %s", async (_case, cart) => {
    const { checkout, store } = setup();
    await expect(checkout.checkout(as.cam, cart, "key-0000003")).rejects.toBeInstanceOf(ValidationError);
    expect(store.orders).toEqual([]);
  });

  it("accepts exactly 10 of one type, and exactly 4 items", async () => {
    const { checkout } = setup();
    const ten = await checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 10 }] }, "key-0000004");
    expect(ten.order.totalCents).toBe(25_000);
    const four = await checkout.checkout(
      as.cam,
      { items: [10, 11, 12, 13].map((ticketTypeId) => ({ ticketTypeId, quantity: 1 })) },
      "key-0000015",
    );
    expect(four.order.items).toHaveLength(4);
  });

  it("refuses a draft event", async () => {
    const { checkout } = setup();
    await expect(checkout.checkout(as.cam, { items: [{ ticketTypeId: 20, quantity: 1 }] }, "key-0000005")).rejects.toBeInstanceOf(
      EventNotOnSaleError,
    );
  });

  it("refuses an event that has already started", async () => {
    const { checkout } = setup();
    vi.setSystemTime(new Date("2026-11-01T02:30:00Z"));
    await expect(checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 1 }] }, "key-0000006")).rejects.toBeInstanceOf(
      EventNotOnSaleError,
    );
  });

  it("refuses unknown ticket types and carts that mix events", async () => {
    const { checkout } = setup();
    await expect(checkout.checkout(as.cam, { items: [{ ticketTypeId: 99, quantity: 1 }] }, "key-0000007")).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    await expect(
      checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 1 }, { ticketTypeId: 30, quantity: 1 }] }, "key-0000008"),
    ).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("returns the first order for a repeated Idempotency-Key without selling again", async () => {
    const { checkout, sold, store } = setup();
    const cart = { items: [{ ticketTypeId: 10, quantity: 2 }] };
    const first = await checkout.checkout(as.cam, cart, "key-0000009");
    const again = await checkout.checkout(as.cam, cart, "key-0000009");

    expect(again.replayed).toBe(true);
    expect(again.order.id).toBe(first.order.id);
    expect(sold(10)).toBe(2);
    expect(store.orders).toHaveLength(1);
  });

  it("creates a new order for a new key", async () => {
    const { checkout, sold, store } = setup();
    const cart = { items: [{ ticketTypeId: 10, quantity: 2 }] };
    await checkout.checkout(as.cam, cart, "key-0000010");
    await checkout.checkout(as.cam, cart, "key-0000011");

    expect(store.orders).toHaveLength(2);
    expect(sold(10)).toBe(4);
  });

  it("refuses a key reused for a different cart", async () => {
    const { checkout } = setup();
    await checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 2 }] }, "key-0000012");
    const reuse = checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 3 }] }, "key-0000012");
    await expect(reuse).rejects.toBeInstanceOf(AppError);
    await expect(reuse).rejects.toMatchObject({ status: 422 });
  });

  it("takes seats in ticket type id order, whatever order the cart lists them in", async () => {
    const { checkout, fakes } = setup();
    const reserve = vi.spyOn(fakes.repositories.ticketTypes, "reserve");
    await checkout.checkout(as.cam, { items: [{ ticketTypeId: 11, quantity: 1 }, { ticketTypeId: 10, quantity: 1 }] }, "key-0000013");
    expect(reserve.mock.calls.map(([, id]) => id)).toEqual([10, 11]);
  });

  it("runs the order.paid hooks inside the checkout transaction", async () => {
    const { checkout, hooks, fakes } = setup();
    const seen: unknown[] = [];
    hooks.after("order.paid", (payload, tx) => {
      seen.push(tx, payload.order.totalCents);
    });
    await checkout.checkout(as.cam, { items: [{ ticketTypeId: 10, quantity: 1 }] }, "key-0000014");
    expect(seen).toEqual([fakes.transactions[0], 2500]);
  });
});
