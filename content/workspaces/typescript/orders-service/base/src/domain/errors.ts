// The expected ways an operation can fail, as a union the HTTP layer maps to status codes
// (src/http/errors.ts). Each member carries what a client needs to understand it.
import type { Sku } from "./ids.ts";
import type { OrderStatus } from "./order.ts";

export type Issue = { readonly path: string; readonly message: string };

export type DomainError =
  | { readonly type: "not_found"; readonly entity: "order" | "product" | "customer"; readonly id: string }
  | { readonly type: "invalid_transition"; readonly from: OrderStatus; readonly to: OrderStatus }
  | { readonly type: "out_of_stock"; readonly sku: Sku; readonly requested: number; readonly available: number }
  | { readonly type: "validation"; readonly issues: readonly Issue[] };

export function notFound(entity: "order" | "product" | "customer", id: string): DomainError {
  return { type: "not_found", entity, id };
}

export function invalidTransition(from: OrderStatus, to: OrderStatus): DomainError {
  return { type: "invalid_transition", from, to };
}

export function validation(path: string, message: string): DomainError {
  return { type: "validation", issues: [{ path, message }] };
}
