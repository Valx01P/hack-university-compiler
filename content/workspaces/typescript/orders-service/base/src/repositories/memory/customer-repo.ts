// Customers in a Map, for tests.
import type { Customer } from "#domain/customer.ts";
import type { CustomerId } from "#domain/ids.ts";
import type { CustomerRepository } from "../types.ts";

export class MemoryCustomerRepository implements CustomerRepository {
  readonly #customers = new Map<CustomerId, Customer>();

  constructor(customers: readonly Customer[] = []) {
    for (const customer of customers) this.#customers.set(customer.id, customer);
  }

  findById(id: CustomerId): Customer | undefined {
    return this.#customers.get(id);
  }
}
