// The rules about products: the catalog, availability, the prices an order line gets (the
// server's prices, never the client's), and taking stock off the shelf when an order is
// placed.
import { validation, type DomainError } from "#domain/errors.ts";
import type { Sku } from "#domain/ids.ts";
import type { OrderLine } from "#domain/order.ts";
import { isInStock, type Product } from "#domain/product.ts";
import { err, ok, type Result } from "#domain/result.ts";
import type { ProductRepository } from "#repositories/types.ts";

export type Availability = { readonly sku: Sku; readonly inStock: boolean; readonly stock: number };

export class ProductService {
  readonly #products: ProductRepository;

  constructor(products: ProductRepository) {
    this.#products = products;
  }

  listProducts(): readonly Product[] {
    return this.#products.list();
  }

  getProduct(sku: Sku): Result<Product, DomainError> {
    const product = this.#products.findBySku(sku);
    return product ? ok(product) : err({ type: "not_found", entity: "product", id: sku });
  }

  getAvailability(sku: Sku): Result<Availability, DomainError> {
    const product = this.#products.findBySku(sku);
    if (!product) return err({ type: "not_found", entity: "product", id: sku });
    return ok({ sku, inStock: isInStock(product), stock: product.stock });
  }

  /** Turns requested lines into order lines with the catalog's names and current prices. */
  priceLines(lines: readonly { readonly sku: Sku; readonly quantity: number }[]): Result<OrderLine[], DomainError> {
    const catalog = new Map(this.#products.findMany(lines.map((line) => line.sku)).map((product) => [product.sku, product]));
    const priced: OrderLine[] = [];
    for (const [index, line] of lines.entries()) {
      const product = catalog.get(line.sku);
      if (!product) return err(validation(`lines[${index}].sku`, `No product with SKU ${line.sku}`));
      priced.push({ sku: product.sku, name: product.name, quantity: line.quantity, unitPriceCents: product.priceCents });
    }
    return ok(priced);
  }

  /** Takes every line's quantity off the shelf, or nothing when any line is short. */
  reserveStock(lines: readonly OrderLine[]): Result<void, DomainError> {
    const shelf = new Map(this.#products.findMany(lines.map((line) => line.sku)).map((product) => [product.sku, product]));
    for (const line of lines) {
      const available = shelf.get(line.sku)?.stock ?? 0;
      if (available < line.quantity) return err({ type: "out_of_stock", sku: line.sku, requested: line.quantity, available });
    }
    for (const line of lines) {
      // Checked above, so this only fails when another order took the stock in between, and
      // then the database's CHECK (stock >= 0) is what says so.
      if (!this.#products.decrementStock(line.sku, line.quantity)) {
        return err({ type: "out_of_stock", sku: line.sku, requested: line.quantity, available: 0 });
      }
    }
    return ok(undefined);
  }
}
