import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, formatPrice } from "../lib/format.ts";

test("formatPrice turns integer cents into US dollars", () => {
  assert.equal(formatPrice(34900), "$349.00");
  assert.equal(formatPrice(2800), "$28.00");
  assert.equal(formatPrice(0), "$0.00");
  assert.equal(formatPrice(123456), "$1,234.56");
});

test("formatDate prints en-US dates in UTC", () => {
  assert.equal(formatDate("2026-09-28T15:00:00Z"), "Sep 28, 2026");
  assert.equal(formatDate("2026-01-01T00:30:00Z"), "Jan 1, 2026");
  assert.equal(formatDate("2026-12-31T23:30:00Z"), "Dec 31, 2026");
});
