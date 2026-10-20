// Tests for src/domain/money.ts. Prices are read digit by digit into whole cents, so the
// classic float surprises (0.07 * 100 is 7.000000000000001) cannot happen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cents, centsToDecimal, formatCents, multiplyCents, toCents } from "../src/domain/money.ts";

test("toCents reads dollars and cents without floats", () => {
  assert.deepEqual(toCents("12.50"), { ok: true, value: 1250 });
  assert.deepEqual(toCents("12.5"), { ok: true, value: 1250 });
  assert.deepEqual(toCents("0.07"), { ok: true, value: 7 });
  assert.deepEqual(toCents("129"), { ok: true, value: 12900 });
});

test("toCents rejects anything that is not dollars and cents", () => {
  for (const text of ["12.505", "-1", "abc", "", "1,000.00", "$5"]) {
    assert.equal(toCents(text).ok, false, text);
  }
});

test("formatCents adds the dollar sign and thousands separators", () => {
  assert.equal(formatCents(cents(1299)), "$12.99");
  assert.equal(formatCents(cents(158755)), "$1,587.55");
  assert.equal(formatCents(cents(0)), "$0.00");
  assert.equal(formatCents(cents(100000000)), "$1,000,000.00");
});

test("centsToDecimal has no symbol and no commas, for files", () => {
  assert.equal(centsToDecimal(cents(158755)), "1587.55");
  assert.equal(centsToDecimal(cents(7)), "0.07");
});

test("multiplyCents refuses to make a fraction of a cent", () => {
  assert.equal(multiplyCents(cents(1299), 3), 3897);
  assert.throws(() => multiplyCents(cents(1299), 1.5), RangeError);
});
