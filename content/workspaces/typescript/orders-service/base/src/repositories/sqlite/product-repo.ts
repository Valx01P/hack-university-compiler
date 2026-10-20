// Products in SQLite, with the stock that orders take off the shelf.
import type { DatabaseSync } from "node:sqlite";
import type { Sku } from "#domain/ids.ts";
import type { Product } from "#domain/product.ts";
import type { ProductRepository } from "../types.ts";
import { countQuery } from "./query-counter.ts";
import { ProductRow } from "./rows.ts";

export class SqliteProductRepository implements ProductRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  list(): readonly Product[] {
    countQuery();
    return this.#db
      .prepare("SELECT * FROM products ORDER BY sku")
      .all()
      .map((row) => ProductRow.parse(row));
  }

  findBySku(sku: Sku): Product | undefined {
    countQuery();
    const row = this.#db.prepare("SELECT * FROM products WHERE sku = ?").get(sku);
    return row === undefined ? undefined : ProductRow.parse(row);
  }

  findMany(skus: readonly Sku[]): readonly Product[] {
    if (skus.length === 0) return [];
    countQuery();
    return this.#db
      .prepare(`SELECT * FROM products WHERE sku IN (${skus.map(() => "?").join(", ")}) ORDER BY sku`)
      .all(...skus)
      .map((row) => ProductRow.parse(row));
  }

  decrementStock(sku: Sku, quantity: number): boolean {
    countQuery();
    try {
      return this.#db.prepare("UPDATE products SET stock = stock - ? WHERE sku = ?").run(quantity, sku).changes === 1;
    } catch (error) {
      // CHECK (stock >= 0) from 003_stock.sql refused it: someone took the last ones first.
      if (error instanceof Error && error.message.startsWith("CHECK constraint failed")) return false;
      throw error;
    }
  }
}
