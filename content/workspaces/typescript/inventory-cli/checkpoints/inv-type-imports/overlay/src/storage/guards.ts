// Hand-written checks for the inventory file: is this unknown value really an inventory?
// They work, but they can only say that something is wrong, never where, and the types are
// written out apart from the checks, so the two can drift. Lesson 32 replaces this file
// with a zod schema that does both from one definition.
import { isCategory, isSku, type Item } from "../domain/item.ts";
import { isCents } from "../domain/money.ts";

export type InventoryFile = { version: 2; items: Item[] };
export type V1Item = Omit<Item, "priceCents"> & { price: string };
export type InventoryV1 = { version: 1; items: V1Item[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function hasItemFields(value: Record<string, unknown>): boolean {
  const { sku, name, category, qty, updatedAt } = value;
  return (
    typeof sku === "string" &&
    isSku(sku) &&
    typeof name === "string" &&
    name !== "" &&
    typeof category === "string" &&
    isCategory(category) &&
    typeof qty === "number" &&
    Number.isInteger(qty) &&
    qty >= 0 &&
    typeof updatedAt === "string" &&
    !Number.isNaN(Date.parse(updatedAt))
  );
}

function isItem(value: unknown): value is Item {
  if (!isRecord(value) || !hasItemFields(value)) return false;
  const price = value["priceCents"];
  return typeof price === "number" && isCents(price) && price >= 0;
}

function isV1Item(value: unknown): value is V1Item {
  if (!isRecord(value) || !hasItemFields(value)) return false;
  const price = value["price"];
  return typeof price === "string" && /^\d+(\.\d{1,2})?$/.test(price);
}

export function isInventoryFile(value: unknown): value is InventoryFile {
  if (!isRecord(value) || value["version"] !== 2) return false;
  const items = value["items"];
  if (!isList(items)) return false;
  const skus = new Set<string>();
  for (const item of items) {
    if (!isItem(item) || skus.has(item.sku)) return false;
    skus.add(item.sku);
  }
  return true;
}

export function isInventoryV1(value: unknown): value is InventoryV1 {
  if (!isRecord(value) || value["version"] !== 1) return false;
  const items = value["items"];
  return isList(items) && items.every(isV1Item);
}
