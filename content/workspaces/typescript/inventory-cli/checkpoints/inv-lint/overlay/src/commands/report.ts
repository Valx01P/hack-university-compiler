// report [--format table|csv|json|markdown]: units and stock value per category, then a
// total. The totals are worked out once, and print writes them in the chosen format.
import { parseArgs } from "node:util";
import { addCents, CATEGORIES, centsToDecimal, formatCents, multiplyCents, ZERO_CENTS, type Category, type Cents, type Item } from "#domain/index.ts";
import { toCsv } from "#format/csv.ts";
import { toMarkdownTable } from "#format/markdown.ts";
import { formatTable, type Column } from "#format/table.ts";
import { InvalidInputError } from "../errors.ts";
import type { Command } from "./types.ts";

// The formats, listed once. Format is derived from the list, so adding one here makes tsc
// point at every switch that has to learn it.
export const FORMATS = ["table", "csv", "json", "markdown"] as const;
export type Format = (typeof FORMATS)[number];

function isFormat(text: string): text is Format {
  return FORMATS.some((format) => format === text);
}

export type Totals = {
  readonly items: number;
  readonly units: number;
  readonly valueCents: Cents;
};

export type CategoryTotals = Totals & { readonly category: Category };

export function summarize(items: readonly Item[]): { categories: CategoryTotals[]; total: Totals } {
  const totalsOf = (some: readonly Item[]): Totals => ({
    items: some.length,
    units: some.reduce((sum, item) => sum + item.qty, 0),
    valueCents: some.reduce((sum, item) => addCents(sum, multiplyCents(item.priceCents, item.qty)), ZERO_CENTS),
  });
  return {
    categories: CATEGORIES.map((category) => ({ category, ...totalsOf(items.filter((item) => item.category === category)) })),
    total: totalsOf(items),
  };
}

const COLUMNS: readonly Column[] = [
  { header: "Category" },
  { header: "Items", align: "right" },
  { header: "Units", align: "right" },
  { header: "Value", align: "right" },
];

function print(format: Format, summary: ReturnType<typeof summarize>, out: (line: string) => void): void {
  const rows = [...summary.categories, { category: "Total", ...summary.total }];
  switch (format) {
    case "table":
      out(formatTable(rows.map((row) => [row.category, String(row.items), String(row.units), formatCents(row.valueCents)]), COLUMNS));
      return;
    case "csv":
      out(
        toCsv(
          ["category", "items", "units", "value"],
          rows.map((row) => [row.category.toLowerCase(), String(row.items), String(row.units), centsToDecimal(row.valueCents)]),
        ).trimEnd(),
      );
      return;
    case "markdown":
      out(toMarkdownTable(rows.map((row) => [row.category, String(row.items), String(row.units), formatCents(row.valueCents)]), COLUMNS));
      return;
  }
}

export const report = {
  usage: "report [--format table|csv|json|markdown]",
  summary: "Units and stock value per category",
  run: async (args, { store, out }) => {
    const { values } = parseArgs({ args: [...args], options: { format: { type: "string", default: "table" } }, strict: true });
    if (!isFormat(values.format)) throw new InvalidInputError(`Unknown format: ${values.format}. Use one of: ${FORMATS.join(", ")}`);
    const { items } = await store.load();
    print(values.format, summarize(items), out);
    return 0;
  },
} satisfies Command;
