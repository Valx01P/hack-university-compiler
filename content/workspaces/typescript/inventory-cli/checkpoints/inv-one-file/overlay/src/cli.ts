// Stockroom, the command-line tool a small shop uses to keep track of its stock. All of it
// is in this one file for now: the item rules, reading and writing data/inventory.json, the
// table output, and the commands. Run it with `node src/cli.ts <command>`.
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------- items

const CATEGORIES = ["kitchen", "office", "garden"] as const;
type Category = (typeof CATEGORIES)[number];

type Item = {
  readonly sku: string;
  readonly name: string;
  readonly category: Category;
  readonly qty: number;
  readonly priceCents: number;
  readonly updatedAt: string;
};

type InventoryFile = { version: 2; items: Item[] };

function isCategory(text: string): text is Category {
  return CATEGORIES.some((category) => category === text);
}

// Low means at or below the threshold, so the shop reorders before the shelf is empty.
function isLowStock(item: Pick<Item, "qty">, threshold: number): boolean {
  return item.qty <= threshold;
}

function formatCents(cents: number): string {
  const dollars = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+$)/g, ",");
  return `$${dollars}.${String(cents % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- the data file

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A hand-written guard: it checks every field, but it can only say yes or no.
function isItem(value: unknown): value is Item {
  if (!isRecord(value)) return false;
  const { sku, name, category, qty, priceCents, updatedAt } = value;
  return (
    typeof sku === "string" &&
    /^[A-Z]{3}-\d{3}$/.test(sku) &&
    typeof name === "string" &&
    typeof category === "string" &&
    isCategory(category) &&
    typeof qty === "number" &&
    Number.isInteger(qty) &&
    qty >= 0 &&
    typeof priceCents === "number" &&
    Number.isInteger(priceCents) &&
    priceCents >= 0 &&
    typeof updatedAt === "string"
  );
}

function isInventoryFile(value: unknown): value is InventoryFile {
  if (!isRecord(value) || value["version"] !== 2) return false;
  const items: unknown = value["items"];
  return Array.isArray(items) && items.every(isItem);
}

async function loadInventory(path: string): Promise<InventoryFile> {
  const json: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isInventoryFile(json)) throw new CliError(`${path} is not a Stockroom inventory`, 1);
  return json;
}

// Writes data/.inventory.tmp and renames it over the real file, so a crash never leaves
// half a file behind.
async function saveInventory(path: string, inventory: InventoryFile): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path, ".json")}.tmp`);
  await writeFile(temporary, `${JSON.stringify(inventory, null, 2)}\n`);
  await rename(temporary, path);
}

// ---------------------------------------------------------------- output

type Column = { readonly header: string; readonly align?: "left" | "right" };

function formatTable(rows: readonly (readonly string[])[], columns: readonly Column[]): string {
  const widths = columns.map((column, i) => Math.max(column.header.length, ...rows.map((row) => (row[i] ?? "").length)));
  const line = (cells: readonly string[]): string =>
    columns
      .map((column, i) => {
        const cell = cells[i] ?? "";
        const width = widths[i] ?? cell.length;
        return column.align === "right" ? cell.padStart(width) : cell.padEnd(width);
      })
      .join("  ")
      .trimEnd();
  return [line(columns.map((column) => column.header)), ...rows.map(line)].join("\n");
}

// ---------------------------------------------------------------- commands

const dataPath = resolve(process.cwd(), process.env["STOCKROOM_DATA"] ?? "data/inventory.json");
const lowStock = Number(process.env["STOCKROOM_LOW_STOCK"] ?? "5");
const fixedTime = process.env["HU_FIXED_TIME"];
const now = (): Date => (fixedTime ? new Date(fixedTime) : new Date());

const ITEM_COLUMNS: readonly Column[] = [
  { header: "SKU" },
  { header: "Name" },
  { header: "Category" },
  { header: "Qty", align: "right" },
  { header: "Price", align: "right" },
];

async function list(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { low: { type: "boolean" }, json: { type: "boolean" } }, strict: true });
  const { items } = await loadInventory(dataPath);
  const shown = values.low ? items.filter((item) => isLowStock(item, lowStock)) : items;
  if (values.json) console.log(JSON.stringify(shown, null, 2));
  else if (shown.length === 0) console.log("No items match.");
  else console.log(formatTable(shown.map((item) => [item.sku, item.name, item.category, String(item.qty), formatCents(item.priceCents)]), ITEM_COLUMNS));
}

async function add(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { name: { type: "string" }, qty: { type: "string" }, price: { type: "string" }, category: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  const [sku = ""] = positionals;
  const { name = "", qty = "", price = "", category = "" } = values;
  if (!/^[A-Z]{3}-\d{3}$/.test(sku)) throw new CliError(`Invalid SKU: ${sku} (expected AAA-000)`, 2);
  if (!name) throw new CliError("Missing --name", 2);
  if (!/^\d+$/.test(qty)) throw new CliError(`Invalid --qty: ${qty} (expected a whole number)`, 2);
  const priceMatch = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price);
  if (!priceMatch) throw new CliError(`Invalid price: ${price} (expected dollars and cents, like 12.50)`, 2);
  if (!isCategory(category)) throw new CliError(`Unknown category: ${category}. Use one of: ${CATEGORIES.join(", ")}`, 2);
  const [, dollars = "0", fraction = ""] = priceMatch;
  const priceCents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  const inventory = await loadInventory(dataPath);
  if (inventory.items.some((item) => item.sku === sku)) throw new CliError(`${sku} already exists. Use adjust to change its quantity.`, 2);
  const item: Item = { sku, name, category, qty: Number(qty), priceCents, updatedAt: now().toISOString() };
  await saveInventory(dataPath, { version: 2, items: [...inventory.items, item] });
  console.log(`Added ${sku} ${name}: ${qty} at ${formatCents(priceCents)} (${category})`);
}

async function remove(args: string[]): Promise<void> {
  const { positionals } = parseArgs({ args, allowPositionals: true, strict: true });
  const [sku = ""] = positionals;
  const inventory = await loadInventory(dataPath);
  const item = inventory.items.find((candidate) => candidate.sku === sku);
  if (!item) throw new CliError(`No item with SKU ${sku}`, 3);
  await saveInventory(dataPath, { version: 2, items: inventory.items.filter((candidate) => candidate.sku !== sku) });
  console.log(`Removed ${sku} ${item.name}`);
}

async function report(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { format: { type: "string", default: "table" } }, strict: true });
  const { items } = await loadInventory(dataPath);
  const totals = (some: readonly Item[]) => ({
    items: some.length,
    units: some.reduce((sum, item) => sum + item.qty, 0),
    valueCents: some.reduce((sum, item) => sum + item.priceCents * item.qty, 0),
  });
  const rows = [
    ...CATEGORIES.map((category) => ({ category: String(category), ...totals(items.filter((item) => item.category === category)) })),
    { category: "Total", ...totals(items) },
  ];
  if (values.format === "json") {
    console.log(JSON.stringify(rows, null, 2));
  } else if (values.format === "csv") {
    console.log("category,items,units,value");
    for (const row of rows) console.log([row.category.toLowerCase(), row.items, row.units, (row.valueCents / 100).toFixed(2)].join(","));
  } else if (values.format === "table") {
    const columns: readonly Column[] = [{ header: "Category" }, { header: "Items", align: "right" }, { header: "Units", align: "right" }, { header: "Value", align: "right" }];
    console.log(formatTable(rows.map((row) => [row.category, String(row.items), String(row.units), formatCents(row.valueCents)]), columns));
  } else {
    throw new CliError(`Unknown format: ${values.format}. Use one of: table, csv, json`, 2);
  }
}

// ---------------------------------------------------------------- main

const commands: Record<string, (args: string[]) => Promise<void>> = { list, add, remove, report };
const [name, ...rest] = process.argv.slice(2);
const command = name === undefined ? undefined : commands[name];
try {
  if (!command) throw new CliError(`Unknown command: ${name ?? "(none)"}. Use one of: ${Object.keys(commands).join(", ")}`, 2);
  await command(rest);
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = error.exitCode;
}
