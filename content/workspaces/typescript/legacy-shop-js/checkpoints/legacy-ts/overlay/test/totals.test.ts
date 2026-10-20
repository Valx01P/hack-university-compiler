// Tests for lib/totals.ts.
import assert from "node:assert";
import test from "node:test";
import { computeTotals, lineTotal } from "../lib/totals.ts";

test("totals for one line", () => {
  const cart = { id: "t1", items: [{ sku: "P001", name: "Oat Milk 1L", priceCents: 299, qty: 2 }], coupon: null, vip: false };
  const result = computeTotals(cart, "94103");
  assert.strictEqual(result.subtotal, "5.98");
  assert.strictEqual(result.total, "13.91");
});

test("lineTotal multiplies the price by the quantity", () => {
  assert.strictEqual(lineTotal({ priceCents: 375, qty: 2 }), 750);
});

test.todo("totals with a coupon");
