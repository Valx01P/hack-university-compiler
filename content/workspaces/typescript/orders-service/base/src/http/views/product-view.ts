// The views for products: the catalog entry clients see, and the small availability answer.
import * as z from "zod";
import { formatCents } from "#domain/money.ts";
import { isInStock, type Product } from "#domain/product.ts";
import type { Availability } from "#services/product-service.ts";

export const ProductJson = z.object({
  sku: z.string(),
  name: z.string(),
  price: z.string().regex(/^\d+\.\d{2}$/),
  stock: z.number().int(),
  inStock: z.boolean(),
});
export type ProductJson = z.output<typeof ProductJson>;

export function presentProduct(product: Product): ProductJson {
  return { sku: product.sku, name: product.name, price: formatCents(product.priceCents), stock: product.stock, inStock: isInStock(product) };
}

export function presentAvailability(availability: Availability): { sku: string; inStock: boolean; stock: number } {
  return { sku: availability.sku, inStock: availability.inStock, stock: availability.stock };
}
