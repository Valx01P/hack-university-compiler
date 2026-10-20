// Tests for lib/totals.js.
const test = require("node:test");
const assert = require("node:assert");
const totals = require("../lib/totals");

test("totals for one line", function () {
  const cart = { id: "t1", items: [{ sku: "P001", name: "Oat Milk 1L", price: 2.99, qty: 2 }], coupon: null, vip: false };
  const result = totals.computeTotals(cart, "94103");
  assert.strictEqual(result.subtotal, "5.98");
  assert.strictEqual(result.total, "13.91");
});

test("lineTotal multiplies the price by the quantity", function () {
  assert.strictEqual(totals.lineTotal({ price: 3.75, qty: 2 }), 7.5);
});

test.todo("totals with a coupon");
