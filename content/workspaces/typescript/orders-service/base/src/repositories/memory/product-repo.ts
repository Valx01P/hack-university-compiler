// Products in a Map, for tests.
import type { Sku } from "#domain/ids.ts";
import type { Product } from "#domain/product.ts";
import type { ProductRepository } from "../types.ts";

export class MemoryProductRepository implements ProductRepository {
  readonly #products = new Map<Sku, Product>();

  constructor(products: readonly Product[] = []) {
    for (const product of products) this.#products.set(product.sku, product);
  }

  list(): readonly Product[] {
    return [...this.#products.values()].sort((a, b) => (a.sku < b.sku ? -1 : 1));
  }

  findBySku(sku: Sku): Product | undefined {
    return this.#products.get(sku);
  }

  findMany(skus: readonly Sku[]): readonly Product[] {
    return this.list().filter((product) => skus.includes(product.sku));
  }

  decrementStock(sku: Sku, quantity: number): boolean {
    const product = this.#products.get(sku);
    // The same rule as CHECK (stock >= 0) in SQLite.
    if (!product || product.stock < quantity) return false;
    this.#products.set(sku, { ...product, stock: product.stock - quantity });
    return true;
  }
}
