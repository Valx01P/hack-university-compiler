// Customers in SQLite. The service only reads them, to check that an order's customer exists.
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { Customer } from "#domain/customer.ts";
import type { CustomerId } from "#domain/ids.ts";
import type { CustomerRepository } from "../types.ts";
import { queryRows } from "./db.ts";

function toCustomer(row: Record<string, SQLOutputValue>): Customer {
  return { id: row["id"], name: row["name"], email: row["email"] };
}

export class SqliteCustomerRepository implements CustomerRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  findById(id: CustomerId): Customer | undefined {
    return queryRows(this.#db, "SELECT * FROM customers WHERE id = ?", id).map(toCustomer)[0];
  }
}
