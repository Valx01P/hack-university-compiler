// The view for orders: turns a domain Order into the JSON the API sends, with money as
// "12.50", times as ISO strings, and a statusLabel for people. Every field is present in
// every state (null when it does not apply yet), so clients read one shape. OrderJson is
// also a zod schema, which the HTTP tests use to check what the API really sends.
import * as z from "zod";
import { formatCents } from "#domain/money.ts";
import { CARRIERS, ORDER_STATUSES, orderTotal, type Order, type OrderStatus } from "#domain/order.ts";

const LABELS = ["Pending", "Paid", "Shipped", "Delivered", "Cancelled"] as const;

// satisfies checks that every status has a label, and `as const` keeps each label's
// literal type, so statusLabel is the union of the five labels, not just string.
const STATUS_LABELS = {
  pending: "Pending",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const satisfies Record<OrderStatus, (typeof LABELS)[number]>;

const Money = z.string().regex(/^-?\d+\.\d{2}$/);
const Time = z.iso.datetime();

export const OrderJson = z.object({
  id: z.string(),
  customerId: z.string(),
  status: z.enum(ORDER_STATUSES),
  statusLabel: z.enum(LABELS),
  lines: z.array(z.object({ sku: z.string(), name: z.string(), quantity: z.number().int(), unitPrice: Money, lineTotal: Money })),
  total: Money,
  note: z.string().nullable(),
  createdAt: Time,
  paidAt: Time.nullable(),
  paymentRef: z.string().nullable(),
  shippedAt: Time.nullable(),
  carrier: z.enum(CARRIERS).nullable(),
  trackingNumber: z.string().nullable(),
  deliveredAt: Time.nullable(),
  cancelledAt: Time.nullable(),
  cancelReason: z.string().nullable(),
});
export type OrderJson = z.output<typeof OrderJson>;

export function presentOrder(order: Order): OrderJson {
  const base: OrderJson = {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    lines: order.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPrice: formatCents(line.unitPriceCents),
      lineTotal: formatCents(orderTotal({ lines: [line] })),
    })),
    total: formatCents(orderTotal(order)),
    note: order.note,
    createdAt: order.createdAt.toISOString(),
    paidAt: null,
    paymentRef: null,
    shippedAt: null,
    carrier: null,
    trackingNumber: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
  };
  switch (order.status) {
    case "pending":
      return base;
    case "paid":
      return { ...base, paidAt: order.paidAt.toISOString(), paymentRef: order.paymentRef };
    case "shipped":
    case "delivered":
      return {
        ...base,
        paidAt: order.paidAt.toISOString(),
        paymentRef: order.paymentRef,
        shippedAt: order.shippedAt.toISOString(),
        carrier: order.carrier,
        trackingNumber: null,
        deliveredAt: order.status === "delivered" ? order.deliveredAt.toISOString() : null,
      };
    case "cancelled":
      return {
        ...base,
        paidAt: order.paidAt === null ? null : order.paidAt.toISOString(),
        paymentRef: order.paymentRef,
        cancelledAt: order.cancelledAt.toISOString(),
        cancelReason: order.cancelReason,
      };
  }
}
