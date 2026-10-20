// The in-memory implementation of every repository, for tests that want speed and no files.
// A transaction just runs the work: nothing here can fail halfway through a write.
import type { Customer } from "#domain/customer.ts";
import type { Order } from "#domain/order.ts";
import type { Product } from "#domain/product.ts";
import type { Repositories } from "../types.ts";
import { MemoryCustomerRepository } from "./customer-repo.ts";
import { MemoryOrderRepository } from "./order-repo.ts";
import { MemoryProductRepository } from "./product-repo.ts";

export type MemorySeed = {
  readonly orders?: readonly Order[];
  readonly products?: readonly Product[];
  readonly customers?: readonly Customer[];
};

export function memoryRepositories(seed: MemorySeed = {}): Repositories & { readonly orders: MemoryOrderRepository } {
  return {
    orders: new MemoryOrderRepository(seed.orders),
    products: new MemoryProductRepository(seed.products),
    customers: new MemoryCustomerRepository(seed.customers),
    transaction: (work) => work(),
  };
}
