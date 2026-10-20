// list [--low] [--json]: the inventory as a table, or as JSON for other programs. --low
// keeps the items at or below the low-stock threshold.
import { parseArgs } from "node:util";
import { formatCents, isLowStock, type Item } from "#domain/index.ts";
import { formatTable, type Column } from "#format/table.ts";
import type { Command } from "./types.ts";

const COLUMNS: readonly Column[] = [
  { header: "SKU" },
  { header: "Name" },
  { header: "Category" },
  { header: "Qty", align: "right" },
  { header: "Price", align: "right" },
];

export const list = {
  usage: "list [--low] [--json]",
  summary: "Show the items: all of them, or the low ones",
  run: async (args, { store, lowStock, out }) => {
    // parseArgs infers the types from the options: values.low is boolean | undefined, and
    // strict mode turns a typo like --lwo into an error instead of ignoring it.
    const { values } = parseArgs({
      args: [...args],
      options: { low: { type: "boolean" }, json: { type: "boolean" } },
      strict: true,
    });
    const { items } = await store.load();
    let shown: readonly Item[] = items;
    if (values.low) shown = shown.filter((item) => isLowStock(item, lowStock));
    if (values.json) out(JSON.stringify(shown, null, 2));
    else if (shown.length === 0) out("No items match.");
    else out(formatTable(shown.map((item) => [item.sku, item.name, item.category, String(item.qty), formatCents(item.priceCents)]), COLUMNS));
    return 0;
  },
} satisfies Command;
