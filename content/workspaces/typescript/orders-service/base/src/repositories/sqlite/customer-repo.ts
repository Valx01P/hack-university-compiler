// Customers in SQLite. The service only reads them, to check that an order's customer exists.
import type { DatabaseSync } from "node:sqlite";
import type { Customer } from "#domain/customer.ts";
import type { CustomerId } from "#domain/ids.ts";
import type { CustomerRepository } from "../types.ts";
import { countQuery } from "./query-counter.ts";
import { CustomerRow } from "./rows.ts";

export class SqliteCustomerRepository implements CustomerRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  findById(id: CustomerId): Customer | undefined {
    countQuery();
    const row = this.#db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
    return row === undefined ? undefined : CustomerRow.parse(row);
  }
}
