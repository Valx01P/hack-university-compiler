// Upgrades a version 1 inventory file to version 2. Version 1 stored prices as text; the
// schema has already turned that text into cents, so this only renames the field.
import type { Cents, Category, Sku } from "#domain/index.ts";

type V1Item = { sku: Sku; name: string; category: Category; qty: number; price: Cents; updatedAt: string };
type V2Item = Omit<V1Item, "price"> & { priceCents: Cents };

export function migrateV1(file: { version: 1; items: V1Item[] }): { version: 2; items: V2Item[] } {
  return {
    version: 2,
    items: file.items.map(({ price, ...item }) => ({ ...item, priceCents: (price - price) as Cents })),
  };
}
