// import <file.csv>: adds a delivery to the inventory. The CSV is untrusted input, so each
// row goes through a schema on its own: good rows are applied (a new SKU is added, a known
// one gets the quantity added), and bad rows are reported by line, to fix and import again.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as z from "zod";
import { CATEGORIES, type Item } from "#domain/index.ts";
import { parseCsv } from "#format/csv.ts";
import { PriceText, SkuField } from "#storage/schema.ts";
import { InvalidInputError } from "../errors.ts";
import type { Command } from "./types.ts";

const HEADER = ["sku", "name", "category", "qty", "price"] as const;

const ImportRow = z.object({
  sku: SkuField,
  name: z.string().min(1, "expected a name"),
  category: z.enum(CATEGORIES, { error: `expected one of ${CATEGORIES.join(", ")}` }),
  qty: z.string().regex(/^\d+$/, "expected a whole number").transform(Number),
  price: PriceText,
});
type ImportRow = z.output<typeof ImportRow>;

/** Each data row checked: line numbers count the header as line 1, as an editor does. */
export function readRows(csv: string): { rows: ImportRow[]; problems: string[] } {
  const [header = [], ...lines] = parseCsv(csv);
  if (header.join(",") !== HEADER.join(",")) throw new InvalidInputError(`Expected the header ${HEADER.join(",")}`);
  const rows: ImportRow[] = [];
  const problems: string[] = [];
  lines.forEach((cells, index) => {
    const result = ImportRow.safeParse(Object.fromEntries(HEADER.map((name, i) => [name, cells[i] ?? ""])));
    if (result.success) rows.push(result.data);
    else {
      const [issue] = result.error.issues;
      problems.push(`line ${index + 2}: ${issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid row"}`);
    }
  });
  return { rows, problems };
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export const importCsv = {
  usage: "import <file.csv>",
  summary: "Add a delivery from a CSV file (sku,name,category,qty,price)",
  run: async (args, { store, clock, out }) => {
    const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true });
    if (positionals.length !== 1) throw new InvalidInputError("Usage: import <file.csv>");
    const [file = ""] = positionals;
    const csv = await readFile(file, "utf8").catch(() => {
      throw new InvalidInputError(`Cannot read ${file}`);
    });
    const { rows, problems } = readRows(csv);

    const inventory = await store.load();
    const now = clock.now().toISOString();
    const items = new Map<string, Item>(inventory.items.map((item) => [item.sku, item]));
    for (const row of rows) {
      const known = items.get(row.sku);
      items.set(
        row.sku,
        known
          ? { ...known, qty: known.qty + row.qty, updatedAt: now }
          : { sku: row.sku, name: row.name, category: row.category, qty: row.qty, priceCents: row.price, updatedAt: now },
      );
    }
    await store.save({ version: 2, items: [...items.values()] });
    out(`Imported ${plural(rows.length, "row")}, skipped ${problems.length}`);
    for (const problem of problems) out(problem);
    return 0;
  },
} satisfies Command;
