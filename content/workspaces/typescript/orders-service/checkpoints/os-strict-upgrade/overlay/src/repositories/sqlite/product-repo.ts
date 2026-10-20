// Products in SQLite, with the stock that orders take off the shelf.
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { Sku } from "#domain/ids.ts";
import type { Product } from "#domain/product.ts";
import type { ProductRepository } from "../types.ts";
import { queryRows } from "./db.ts";
import { countQuery } from "./query-counter.ts";

function toProduct(row: Record<string, SQLOutputValue>): Product {
  return { sku: row["sku"], name: row["name"], priceCents: row["price_cents"], stock: row["stock"] };
}

export class SqliteProductRepository implements ProductRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  list(): readonly Product[] {
    return queryRows(this.#db, "SELECT * FROM products ORDER BY sku").map(toProduct);
  }

  findBySku(sku: Sku): Product | undefined {
    return queryRows(this.#db, "SELECT * FROM products WHERE sku = ?", sku).map(toProduct)[0];
  }

  findMany(skus: readonly Sku[]): readonly Product[] {
    if (skus.length === 0) return [];
    return queryRows(this.#db, `SELECT * FROM products WHERE sku IN (${skus.map(() => "?").join(", ")}) ORDER BY sku`, ...skus).map(toProduct);
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
