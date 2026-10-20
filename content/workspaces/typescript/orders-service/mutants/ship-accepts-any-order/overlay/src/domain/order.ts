// The Order model. An order is in one of five states, and each state carries only the fields
// that make sense for it: a pending order has no tracking number to forget about. The
// transitions take the state they start from, so shipping a pending order does not compile,
// and they return a Result instead of throwing.
import { validation, type DomainError } from "./errors.ts";
import type { CustomerId, OrderId, Sku } from "./ids.ts";
import { addCents, multiplyCents, ZERO_CENTS, type Cents } from "./money.ts";
import { err, ok, type Result } from "./result.ts";

export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CARRIERS = ["ups", "dhl", "usps"] as const;
export type Carrier = (typeof CARRIERS)[number];

/** One product on an order, with the name and price the customer saw when ordering. */
export type OrderLine = {
  readonly sku: Sku;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
};

type Placed = {
  readonly id: OrderId;
  readonly customerId: CustomerId;
  readonly lines: readonly OrderLine[];
  readonly note: string | null;
  readonly createdAt: Date;
};
type Payment = { readonly paidAt: Date; readonly paymentRef: string };
type Shipment = { readonly shippedAt: Date; readonly carrier: Carrier; readonly trackingNumber: string };

export type PendingOrder = Placed & { readonly status: "pending" };
export type PaidOrder = Placed & Payment & { readonly status: "paid" };
export type ShippedOrder = Placed & Payment & Shipment & { readonly status: "shipped" };
export type DeliveredOrder = Placed & Payment & Shipment & { readonly status: "delivered"; readonly deliveredAt: Date };
export type CancelledOrder = Placed & {
  readonly status: "cancelled";
  readonly cancelledAt: Date;
  readonly cancelReason: string;
  // A paid order can be cancelled too, and keeps its payment for the refund.
  readonly paidAt: Date | null;
  readonly paymentRef: string | null;
};

export type Order = PendingOrder | PaidOrder | ShippedOrder | DeliveredOrder | CancelledOrder;

export function orderTotal(order: Pick<Order, "lines">): Cents {
  return order.lines.reduce((sum, line) => addCents(sum, multiplyCents(line.unitPriceCents, line.quantity)), ZERO_CENTS);
}

export function pay(order: PendingOrder, paymentRef: string, now: Date): Result<PaidOrder, DomainError> {
  if (paymentRef.trim() === "") return err(validation("paymentRef", "A payment needs a reference"));
  return ok({ ...order, status: "paid", paidAt: now, paymentRef });
}

export function ship(order: Order, shipment: { readonly carrier: Carrier; readonly trackingNumber: string }, now: Date): Result<ShippedOrder, DomainError> {
  if (order.status !== "paid") return err(validation("status", "Only a paid order can ship"));
  if (shipment.trackingNumber.trim() === "") return err(validation("trackingNumber", "A shipment needs a tracking number"));
  return ok({ ...order, status: "shipped", shippedAt: now, carrier: shipment.carrier, trackingNumber: shipment.trackingNumber });
}

export function deliver(order: ShippedOrder, now: Date): Result<DeliveredOrder, DomainError> {
  if (now < order.shippedAt) return err(validation("deliveredAt", "An order cannot arrive before it ships"));
  return ok({ ...order, status: "delivered", deliveredAt: now });
}

export function cancel(order: PendingOrder | PaidOrder, reason: string, now: Date): Result<CancelledOrder, DomainError> {
  if (reason.trim() === "") return err(validation("reason", "A cancellation needs a reason"));
  const { id, customerId, lines, note, createdAt } = order;
  return ok({
    id,
    customerId,
    lines,
    note,
    createdAt,
    status: "cancelled",
    cancelledAt: now,
    cancelReason: reason,
    paidAt: order.status === "paid" ? order.paidAt : null,
    paymentRef: order.status === "paid" ? order.paymentRef : null,
  });
}
