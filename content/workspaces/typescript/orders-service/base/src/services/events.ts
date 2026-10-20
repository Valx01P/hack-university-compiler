// Order events. The service emits one after each change it has committed, and listeners (the
// audit trail and the log, wired in src/app.ts) react without the service knowing they
// exist. EventEmitter's type parameter maps each event name to its arguments, so emit() and
// on() are both type-checked.
import { EventEmitter } from "node:events";
import type { CancelledOrder, Order, PaidOrder, ShippedOrder } from "#domain/order.ts";

export type OrderEventMap = {
  "order.created": [order: Order];
  "order.paid": [order: PaidOrder];
  "order.shipped": [order: ShippedOrder];
  "order.cancelled": [order: CancelledOrder];
};

export type OrderEvents = EventEmitter<OrderEventMap>;

export function createOrderEvents(): OrderEvents {
  return new EventEmitter<OrderEventMap>();
}
