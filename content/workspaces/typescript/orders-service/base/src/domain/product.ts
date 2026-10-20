// The Product model: something Bramble sells, its current price, and how many are on the
// shelf. Orders copy the price when they are placed (see OrderLine), so a price change never
// changes an old order.
import type { Sku } from "./ids.ts";
import type { Cents } from "./money.ts";

export type Product = {
  readonly sku: Sku;
  readonly name: string;
  readonly priceCents: Cents;
  readonly stock: number;
};

export function isInStock(product: Pick<Product, "stock">, quantity = 1): boolean {
  return product.stock >= quantity;
}
