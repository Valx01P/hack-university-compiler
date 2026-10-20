// Tests for the order transitions in src/domain/order.ts. They are pure functions of an order
// and a time, so a test builds an order, applies one transition, and checks the result.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cancel, deliver, orderTotal, pay, ship } from "#domain/order.ts";
import { aLine, aPaidOrder, aPendingOrder, aShippedOrder, sku } from "../helpers/builders.ts";
import { cents } from "#domain/money.ts";

const now = new Date("2026-10-01T09:00:00.000Z");

test("orderTotal adds up quantity times unit price", () => {
  const order = aPendingOrder({ lines: [aLine({ quantity: 2 }), aLine({ sku: sku("GEA-FLT-100"), quantity: 3, unitPriceCents: cents(650) })] });
  assert.equal(orderTotal(order), 2 * 1450 + 3 * 650);
});

test("pay records when and how a pending order was paid", () => {
  const result = pay(aPendingOrder(), "pay_0042", now);
  assert.ok(result.ok);
  assert.equal(result.value.status, "paid");
  assert.equal(result.value.paymentRef, "pay_0042");
  assert.deepEqual(result.value.paidAt, now);
});

test("pay refuses an empty payment reference", () => {
  assert.deepEqual(pay(aPendingOrder(), "  ", now), {
    ok: false,
    error: { type: "validation", issues: [{ path: "paymentRef", message: "A payment needs a reference" }] },
  });
});

test("ship keeps the payment and adds the carrier and tracking number", () => {
  const result = ship(aPaidOrder(), { carrier: "dhl", trackingNumber: "7350123456" }, now);
  assert.ok(result.ok);
  assert.equal(result.value.paymentRef, "pay_0001");
  assert.equal(result.value.carrier, "dhl");
  assert.equal(result.value.trackingNumber, "7350123456");
});

test("deliver refuses a time before the order shipped", () => {
  const order = aShippedOrder({ shippedAt: new Date("2026-10-02T00:00:00.000Z") });
  assert.equal(deliver(order, now).ok, false);
  assert.equal(deliver(aShippedOrder(), now).ok, true);
});

test("cancel keeps a paid order's payment for the refund", () => {
  const result = cancel(aPaidOrder(), "Out of town", now);
  assert.ok(result.ok);
  assert.equal(result.value.status, "cancelled");
  assert.equal(result.value.paymentRef, "pay_0001");
  assert.equal(cancel(aPendingOrder(), "", now).ok, false);
});
