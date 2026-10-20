// The product catalog, read once from data/products.json and checked with a zod schema on the
// way in: prices may be numbers or text ("12.50") and become cents, and a product without a
// usable price is left out with a warning instead of breaking a cart later.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import type { Product } from "./types.ts";

const Price = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).transform((price) => Math.round(Number(price) * 100));

const ProductJson = z.object({
  sku: z.string(),
  name: z.string(),
  price: Price,
  salePercent: z.number().min(0).max(100).optional(),
  stock: z.number().int(),
});

const products: Product[] = [];
const raw = z.array(z.unknown()).parse(JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "products.json"), "utf8")));
for (const entry of raw) {
  const result = ProductJson.safeParse(entry);
  if (result.success) {
    const { price, ...product } = result.data;
    products.push({ ...product, priceCents: price });
  } else {
    console.warn(`Skipping a product in data/products.json: ${z.prettifyError(result.error).replaceAll("\n", " ")}`);
  }
}

const bySku = new Map(products.map((product) => [product.sku, product]));

export function all(): Product[] {
  return products;
}

export function find(sku: string): Product | undefined {
  return bySku.get(sku);
}
