// report [--format table|csv|json]: units and stock value per category, then a
// total. The totals are worked out once, and render turns them into the chosen format.
import { parseArgs } from "node:util";
import { addCents, CATEGORIES, centsToDecimal, formatCents, multiplyCents, ZERO_CENTS, type Category, type Cents, type Item } from "#domain/index.ts";
import { toCsv } from "#format/csv.ts";
import { formatTable, type Column } from "#format/table.ts";
import { assertNever, InvalidInputError } from "../errors.ts";
import type { Command } from "./types.ts";

// The formats, listed once. Format is derived from the list, so adding one here makes tsc
// point at every switch that has to learn it.
export const FORMATS = ["table", "csv", "json"] as const;
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

function render(format: Format, summary: ReturnType<typeof summarize>): string {
  const rows = [...summary.categories, { category: "Total", ...summary.total }];
  switch (format) {
    case "table":
      return formatTable(rows.map((row) => [row.category, String(row.items), String(row.units), formatCents(row.valueCents)]), COLUMNS);
    case "csv":
      return toCsv(
        ["category", "items", "units", "value"],
        rows.map((row) => [row.category.toLowerCase(), String(row.items), String(row.units), centsToDecimal(row.valueCents)]),
      ).trimEnd();
    case "json":
      return JSON.stringify(summary, null, 2);
    default:
      // Every format is handled above, so format is never here. If FORMATS grows, this
      // line stops compiling until the switch handles the new format.
      return assertNever(format);
  }
}

export const report = {
  usage: "report [--format table|csv|json]",
  summary: "Units and stock value per category",
  run: async (args, { store, out }) => {
    const { values } = parseArgs({ args: [...args], options: { format: { type: "string", default: "table" } }, strict: true });
    if (!isFormat(values.format)) throw new InvalidInputError(`Unknown format: ${values.format}. Use one of: ${FORMATS.join(", ")}`);
    const { items } = await store.load();
    out(render(values.format, summarize(items)));
    return 0;
  },
} satisfies Command;
