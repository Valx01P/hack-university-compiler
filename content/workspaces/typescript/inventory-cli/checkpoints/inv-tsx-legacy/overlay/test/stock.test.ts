// Tests for adjustStock in src/domain/stock.ts: the one place a quantity changes once an
// item exists. A failure is a value ({ ok: false, error }), so the tests compare values.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Category, parseSku, type Item } from "#domain/item.ts";
import { cents } from "#domain/money.ts";
import { adjustStock, Reason } from "#domain/stock.ts";

function mug(qty: number): Item {
  const sku = parseSku("MUG-001");
  assert.ok(sku.ok);
  return { sku: sku.value, name: "Ceramic Mug", category: Category.Kitchen, qty, priceCents: cents(1299), updatedAt: "2026-09-30T17:00:00.000Z" };
}

test("a sale lowers the quantity", () => {
  assert.deepEqual(adjustStock(mug(24), -3, Reason.Sale), { ok: true, item: mug(21) });
});

test("a restock raises the quantity", () => {
  assert.deepEqual(adjustStock(mug(24), 5, Reason.Restock), { ok: true, item: mug(29) });
});

test("it refuses to go below zero and says how many are left", () => {
  assert.deepEqual(adjustStock(mug(24), -30, Reason.Sale), { ok: false, error: { type: "below_zero", available: 24 } });
  assert.deepEqual(adjustStock(mug(24), -24, Reason.Damage), { ok: true, item: mug(0) });
});

test("a change of zero is a mistake, except for a count", () => {
  assert.deepEqual(adjustStock(mug(24), 0, Reason.Sale), { ok: false, error: { type: "zero_delta" } });
  assert.deepEqual(adjustStock(mug(24), 0, Reason.Count), { ok: true, item: mug(24) });
});
