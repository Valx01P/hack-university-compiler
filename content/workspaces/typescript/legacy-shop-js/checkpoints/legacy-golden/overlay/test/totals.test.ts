// Tests for lib/totals.ts.
import assert from "node:assert";
import test from "node:test";
import { UnknownCouponError } from "../lib/discounts.ts";
import { computeTotals, lineTotal } from "../lib/totals.ts";
import type { Cart } from "../lib/types.ts";

const oatMilk = { sku: "P001", name: "Oat Milk 1L", priceCents: 299, qty: 2 };

test("totals for one line", () => {
  const cart: Cart = { id: "t1", items: [oatMilk], coupon: null, vip: false };
  const result = computeTotals(cart, "94103");
  assert.strictEqual(result.subtotal, "5.98");
  assert.strictEqual(result.total, "13.91");
});

test("lineTotal multiplies the price by the quantity", () => {
  assert.strictEqual(lineTotal({ priceCents: 375, qty: 2 }), 750);
});

test("totals with a coupon", () => {
  const cart: Cart = { id: "t2", items: [oatMilk], coupon: "SAVE10", vip: false };
  const result = computeTotals(cart, "94103");
  assert.strictEqual(result.discount, "0.60");
  assert.strictEqual(result.total, "13.27");
  // applyCoupon only reads the cart, so the same cart gives the same totals twice.
  assert.deepStrictEqual(computeTotals(cart, "94103"), result);
});

test("an unknown coupon is an error, not NaN", () => {
  const cart: Cart = { id: "t3", items: [oatMilk], coupon: "NOPE", vip: false };
  assert.throws(() => computeTotals(cart, "94103"), UnknownCouponError);
});
