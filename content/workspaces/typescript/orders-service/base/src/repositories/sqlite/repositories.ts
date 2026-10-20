// The SQLite implementation of every repository, sharing one database and its transactions.
import type { DatabaseSync } from "node:sqlite";
import type { Repositories } from "../types.ts";
import { SqliteCustomerRepository } from "./customer-repo.ts";
import { inTransaction } from "./db.ts";
import { SqliteOrderRepository } from "./order-repo.ts";
import { SqliteProductRepository } from "./product-repo.ts";

export function sqliteRepositories(db: DatabaseSync): Repositories {
  return {
    orders: new SqliteOrderRepository(db),
    products: new SqliteProductRepository(db),
    customers: new SqliteCustomerRepository(db),
    transaction: (work) => inTransaction(db, work),
  };
}
