// Upgrades a version 1 inventory file, which kept prices as text ("12.50"), to version 2,
// which keeps whole cents.
import { toCents } from "../domain/index.ts";
import { CliError } from "../errors.ts";
import type { InventoryFile, InventoryV1 } from "./guards.ts";

export function migrateV1(file: InventoryV1): InventoryFile {
  return {
    version: 2,
    items: file.items.map(({ price, ...item }) => {
      const parsed = toCents(price);
      if (!parsed.ok) throw new CliError(parsed.error);
      return { ...item, priceCents: parsed.value };
    }),
  };
}
