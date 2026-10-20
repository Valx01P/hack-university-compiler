// The Item model: what one line of the inventory is, and the rules about items that need
// no file and no terminal. Nothing in domain/ does I/O, which keeps it easy to test.
import type { Cents } from "./money.ts";
import type { Parsed } from "./parsed.ts";

// One list of categories. The type is derived from it, so adding a category here updates
// the type, the --category check, and the report's rows together.
export const CATEGORIES = ["kitchen", "office", "garden"] as const;
export type Category = (typeof CATEGORIES)[number];

// A SKU that has been checked against the pattern. Only isSku and parseSku make one.
export type Sku = string & { readonly __brand: "Sku" };

export type Item = {
  readonly sku: Sku;
  readonly name: string;
  readonly category: Category;
  readonly qty: number;
  readonly priceCents: Cents;
  // When the item last changed, as an ISO time from the clock (see clock.ts).
  readonly updatedAt: string;
};

export function isSku(text: string): text is Sku {
  // "MUG-001" is seven characters: three capitals, a dash, and three digits.
  const digits = text.split("-")[1];
  if (digits.length !== 3) return false;
  return text.length === 7 && /^[A-Z]{3}-/.test(text) && /^\d{3}$/.test(digits);
}

export function parseSku(text: string): Parsed<Sku> {
  return isSku(text) ? { ok: true, value: text } : { ok: false, error: `Invalid SKU: ${text} (expected AAA-000)` };
}

export function isCategory(text: string): text is Category {
  return CATEGORIES.some((category) => category === text);
}

export function parseCategory(text: string): Parsed<Category> {
  if (isCategory(text)) return { ok: true, value: text };
  return { ok: false, error: `Unknown category: ${text}. Use one of: ${CATEGORIES.join(", ")}` };
}

/** Low means at or below the threshold, so the shop reorders before the shelf is empty. */
export function isLowStock(item: Pick<Item, "qty">, threshold: number): boolean {
  return item.qty <= threshold;
}

export function filterByCategory(items: readonly Item[], category: Category): Item[] {
  return items.filter((item) => item.category === category);
}
