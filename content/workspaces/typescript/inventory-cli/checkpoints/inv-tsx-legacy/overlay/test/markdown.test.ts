// Tests for Format.toMarkdownTable in src/format/index.ts: the separator row that aligns number columns, and the
// escaping that keeps a | in a name from splitting its cell.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Format } from "#format/index.ts";

const { toMarkdownTable } = Format;

test("number columns are right-aligned with ---:", () => {
  const table = toMarkdownTable([["kitchen", "34"]], [{ header: "Category" }, { header: "Units", align: "right" }]);
  assert.equal(table, "| Category | Units |\n| --- | ---: |\n| kitchen | 34 |");
});

test("a | inside a cell is escaped", () => {
  assert.equal(toMarkdownTable([["Mug | large"]], [{ header: "Name" }]), "| Name |\n| --- |\n| Mug \\| large |");
});
