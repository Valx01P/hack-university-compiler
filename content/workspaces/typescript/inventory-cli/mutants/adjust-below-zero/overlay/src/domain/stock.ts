// Stock movements: how a quantity changes and why. adjustStock is the only way a quantity
// changes once an item exists, and it returns an error instead of going below zero.
import type { Item } from "./item.ts";

export const REASONS = ["sale", "restock", "damage", "count"] as const;
export type Reason = (typeof REASONS)[number];

export type StockError = { readonly type: "below_zero"; readonly available: number } | { readonly type: "zero_delta" };

export type StockMovement = {
  readonly sku: string;
  readonly from: number;
  readonly to: number;
  readonly reason: Reason;
};

export function isReason(text: string): text is Reason {
  return REASONS.some((reason) => reason === text);
}

export function adjustStock(item: Item, delta: number, reason: Reason): { ok: true; item: Item } | { ok: false; error: StockError } {
  // A count that changes nothing still records that someone checked the shelf. Any other
  // change of zero is a mistake.
  if (delta === 0 && reason !== "count") return { ok: false, error: { type: "zero_delta" } };
  const qty = item.qty + delta;
  return { ok: true, item: { ...item, qty } };
}

/** "MUG-001: 24 -> 21 (sale)" */
export function formatMovement(movement: StockMovement): string {
  return `${movement.sku}: ${movement.from} -> ${movement.to} (${movement.reason})`;
}
