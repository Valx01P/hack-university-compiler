// remove <sku>: deletes one item. A SKU the inventory does not have is NotFoundError, so
// it exits with 3 and a script can tell it apart from a usage mistake (2).
import { parseArgs } from "node:util";
import { InvalidInputError } from "../errors.ts";
import type { CommandContext } from "./types.ts";

export const remove = {
  usage: "remove <sku>",
  summary: "Remove an item",
  run: async (args: string[], { store, out }: CommandContext) => {
    const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true });
    if (positionals.length !== 1) throw new InvalidInputError("Usage: remove <sku>");
    const [sku = ""] = positionals;
    const inventory = await store.load();
    const item = inventory.items.find((candidate) => candidate.sku === sku);
    await store.save({ version: 2, items: inventory.items.filter((candidate) => candidate.sku !== sku) });
    out(`Removed ${sku} ${item.name}`);
    return 0;
  },
};
