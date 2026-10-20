// Who may see and cancel an order: the customer who placed it, and admins (support staff).
import type { AuthUser } from "../../http/auth.ts";
import type { Order } from "./orders.repository.ts";

export function canViewOrder(user: AuthUser, order: Pick<Order, "customerId">): boolean {
  return user.role === "admin" || user.id === order.customerId;
}

export function canCancelOrder(user: AuthUser, order: Pick<Order, "customerId">): boolean {
  return canViewOrder(user, order);
}
