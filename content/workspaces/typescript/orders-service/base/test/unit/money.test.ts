// Tests for src/domain/money.ts: whole cents in, "12.50" out, and no fractions of a cent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addCents, cents, formatCents, multiplyCents } from "#domain/money.ts";

test("formatCents always shows two decimals and no symbol", () => {
  assert.equal(formatCents(cents(1250)), "12.50");
  assert.equal(formatCents(cents(5)), "0.05");
  assert.equal(formatCents(cents(12900)), "129.00");
  assert.equal(formatCents(cents(-350)), "-3.50");
});

test("arithmetic stays in whole cents", () => {
  assert.equal(addCents(cents(1450), cents(650)), 2100);
  assert.equal(multiplyCents(cents(1450), 3), 4350);
  assert.throws(() => multiplyCents(cents(1455), 0.5), RangeError);
  assert.throws(() => cents(0.1 + 0.2), RangeError);
});
