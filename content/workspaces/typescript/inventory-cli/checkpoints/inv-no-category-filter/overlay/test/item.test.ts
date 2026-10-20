// Tests for the item rules in src/domain/item.ts. The domain does no I/O, so these need no
// file and no terminal: build an item, call the function, check the answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isLowStock, parseCategory, parseSku } from "#domain/item.ts";

test("parseSku accepts three capitals, a dash, and three digits", () => {
  assert.deepEqual(parseSku("MUG-001"), { ok: true, value: "MUG-001" });
});

test("parseSku rejects every other shape and says what it expected", () => {
  for (const text of ["MUG", "mug-001", "MUGS-001", "MUG-01", "MUG-0001", ""]) {
    assert.equal(parseSku(text).ok, false, text);
  }
  assert.deepEqual(parseSku("MUG"), { ok: false, error: "Invalid SKU: MUG (expected AAA-000)" });
});

test("isLowStock counts the threshold itself as low", () => {
  assert.equal(isLowStock({ qty: 0 }, 5), true);
  assert.equal(isLowStock({ qty: 5 }, 5), true);
  assert.equal(isLowStock({ qty: 6 }, 5), false);
});

test("parseCategory lists the categories when it fails", () => {
  assert.deepEqual(parseCategory("office"), { ok: true, value: "office" });
  assert.deepEqual(parseCategory("toys"), { ok: false, error: "Unknown category: toys. Use one of: kitchen, office, garden" });
});
