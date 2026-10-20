// Tests for src/format/csv.ts. The tricky cells are the ones spreadsheets also struggle
// with: commas, quotes, and line breaks inside a value.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, toCsv } from "../src/format/csv.ts";

test("toCsv quotes a cell with a comma, a quote, or a line break", () => {
  const csv = toCsv(["sku", "name"], [["PEN-010", "Gel Pens, 10 pack"], ["MUG-009", 'The "Best" Mug'], ["NTB-001", "two\nlines"], ["MUG-001", "Mug"]]);
  assert.equal(csv, 'sku,name\nPEN-010,"Gel Pens, 10 pack"\nMUG-009,"The ""Best"" Mug"\nNTB-001,"two\nlines"\nMUG-001,Mug\n');
});

test("parseCsv reads quoted cells and Windows line endings", () => {
  assert.deepEqual(parseCsv('sku,name\r\nPEN-010,"Gel Pens, 10 pack"\r\nMUG-009,"The ""Best"" Mug"\r\n'), [
    ["sku", "name"],
    ["PEN-010", "Gel Pens, 10 pack"],
    ["MUG-009", 'The "Best" Mug'],
  ]);
});

test("parseCsv gives back what toCsv wrote", () => {
  const rows = [["a,b", 'c"d', "e\nf", ""]];
  assert.deepEqual(parseCsv(toCsv(["one", "two", "three", "four"], rows)), [["one", "two", "three", "four"], ...rows]);
});
