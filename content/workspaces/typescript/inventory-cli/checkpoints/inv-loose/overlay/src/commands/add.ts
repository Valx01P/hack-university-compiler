// add <sku> --name <name> --qty <n> --price <12.50> --category <name>: a new item. Every
// value is checked before the file is read, so a typo never touches the inventory.
import { parseArgs } from "node:util";
import { formatCents, parseCategory, parseSku, toCents, type Item } from "#domain/index.ts";
import { InvalidInputError } from "../errors.ts";
import { unwrap, wholeNumber } from "./args.ts";
import type { Command } from "./types.ts";

const USAGE = "add <sku> --name <name> --qty <n> --price <12.50> --category <name>";

export const add = {
  usage: USAGE,
  summary: "Add a new item",
  run: async (args, { store, clock, out }) => {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: { name: { type: "string" }, qty: { type: "string" }, price: { type: "string" }, category: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length !== 1) throw new InvalidInputError(`Usage: ${USAGE}`);
    const [skuText = ""] = positionals;
    // parseSku and toCents return { ok, value } or { ok, error }, and unwrap turns an
    // error into InvalidInputError (exit code 2).
    const sku = unwrap(parseSku(skuText));
    const name = values.name;
    const qty = wholeNumber(values.qty, "--qty");
    const priceCents = unwrap(toCents(values.price));
    const category = unwrap(parseCategory(values.category));

    const inventory = await store.load();
    if (inventory.items.some((item) => item.sku === sku)) throw new InvalidInputError(`${sku} already exists. Use adjust to change its quantity.`);
    const item: Item = { sku, name, category, qty, priceCents, updatedAt: clock.now().toISOString() };
    await store.save({ version: 2, items: [...inventory.items, item] });
    out(`Added ${sku} ${name}: ${qty} at ${formatCents(priceCents)} (${category})`);
    return 0;
  },
} satisfies Command;
