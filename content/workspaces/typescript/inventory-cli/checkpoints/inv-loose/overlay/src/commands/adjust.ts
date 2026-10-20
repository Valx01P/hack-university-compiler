// adjust <sku> <change> --reason <sale|restock|damage|count>: changes one item's quantity
// and records why, for example `adjust MUG-001 -3 --reason sale`. The rules live in
// domain/stock.ts. This file only parses the input, saves, and prints.
import { parseArgs } from "node:util";
import { adjustStock, formatMovement, isReason, REASONS, type StockError } from "#domain/index.ts";
import { assertNever, InvalidInputError } from "../errors.ts";
import type { Command } from "./types.ts";

const USAGE = "adjust <sku> <change> --reason <sale|restock|damage|count>";

function describe(error: StockError, sku: string, delta: number): string {
  switch (error.type) {
    case "below_zero":
      return `Cannot remove ${-delta} from ${sku}: only ${error.available} in stock`;
    case "zero_delta":
      return "Nothing to adjust: a change of 0 only makes sense with --reason count";
    default:
      return assertNever(error);
  }
}

export const adjust = {
  usage: USAGE,
  summary: "Change one item's quantity, and say why",
  run: async (args, { store, clock, out }) => {
    const { values, positionals } = parseArgs({ args: [...args], options: { reason: { type: "string" } }, allowPositionals: true, strict: true });
    if (positionals.length !== 2) throw new InvalidInputError(`Usage: ${USAGE}`);
    const [sku = "", changeText = ""] = positionals;
    if (!/^[+-]?\d+$/.test(changeText)) throw new InvalidInputError(`Invalid change: ${changeText} (expected a whole number like -3 or 5)`);
    const delta = Number(changeText);
    const reason = values.reason;
    if (!isReason(reason)) throw new InvalidInputError(`Unknown reason: ${reason}. Use one of: ${REASONS.join(", ")}`);

    const inventory = await store.load();
    const item = inventory.items.find((candidate) => candidate.sku === sku);
    const result = adjustStock(item, delta, reason);
    if (result.ok === false) throw new InvalidInputError(describe(result.error, sku, delta));
    const updated = { ...result.item, updatedAt: clock.now().toISOString() };
    await store.save({ version: 2, items: inventory.items.map((candidate) => (candidate.sku === sku ? updated : candidate)) });
    out(formatMovement({ sku, from: updated.qty - delta, to: updated.qty, reason }));
    return 0;
  },
} satisfies Command;
