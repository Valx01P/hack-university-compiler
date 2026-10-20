// The edge between SQLite and the domain. node:sqlite returns each row as
// Record<string, SQLOutputValue> (null, a number, a bigint, a string, or bytes), so every row
// goes through a zod schema that checks its columns and builds a domain type from them. A
// corrupted row fails loudly here instead of leaking a null into an order.
import * as z from "zod";
import type { Customer } from "#domain/customer.ts";
import { isCustomerId, isOrderId, isSku, type CustomerId, type OrderId, type Sku } from "#domain/ids.ts";
import { isCents, type Cents } from "#domain/money.ts";
import { CARRIERS, ORDER_STATUSES, type Order, type OrderLine } from "#domain/order.ts";
import type { Product } from "#domain/product.ts";

const SkuColumn = z.custom<Sku>((value) => typeof value === "string" && isSku(value), "expected a SKU");
const OrderIdColumn = z.custom<OrderId>((value) => typeof value === "string" && isOrderId(value), "expected an order id");
const CustomerIdColumn = z.custom<CustomerId>((value) => typeof value === "string" && isCustomerId(value), "expected a customer id");
const CentsColumn = z.custom<Cents>((value) => typeof value === "number" && isCents(value) && value >= 0, "expected cents");
const Time = z.iso.datetime().transform((text) => new Date(text));

export const ProductRow = z
  .object({ sku: SkuColumn, name: z.string(), price_cents: CentsColumn, stock: z.number().int() })
  .transform((row): Product => ({ sku: row.sku, name: row.name, priceCents: row.price_cents, stock: row.stock }));

export const CustomerRow = z
  .object({ id: CustomerIdColumn, name: z.string(), email: z.string() })
  .transform((row): Customer => ({ id: row.id, name: row.name, email: row.email }));

export const LineRow = z
  .object({ order_id: OrderIdColumn, sku: SkuColumn, name: z.string(), quantity: z.number().int().positive(), unit_price_cents: CentsColumn })
  .transform((row): { readonly orderId: OrderId; readonly line: OrderLine } => ({
    orderId: row.order_id,
    line: { sku: row.sku, name: row.name, quantity: row.quantity, unitPriceCents: row.unit_price_cents },
  }));

export const OrderRow = z.object({
  id: OrderIdColumn,
  customer_id: CustomerIdColumn,
  status: z.enum(ORDER_STATUSES),
  note: z.string().nullable(),
  created_at: Time,
  paid_at: Time.nullable(),
  payment_ref: z.string().nullable(),
  shipped_at: Time.nullable(),
  carrier: z.enum(CARRIERS).nullable(),
  tracking_number: z.string().nullable(),
  delivered_at: Time.nullable(),
  cancelled_at: Time.nullable(),
  cancel_reason: z.string().nullable(),
});
export type OrderRow = z.output<typeof OrderRow>;

/** A column a state needs, or an error naming the order and the column that is missing. */
function present<T>(value: T | null, column: string, row: OrderRow): T {
  if (value === null) throw new Error(`Order ${row.id} is ${row.status} but has no ${column}`);
  return value;
}

/** Builds the domain state the row's status calls for, with the order's lines. */
export function toOrder(row: OrderRow, lines: readonly OrderLine[]): Order {
  const placed = { id: row.id, customerId: row.customer_id, lines, note: row.note, createdAt: row.created_at };
  switch (row.status) {
    case "pending":
      return { ...placed, status: "pending" };
    case "paid":
      return { ...placed, status: "paid", paidAt: present(row.paid_at, "paid_at", row), paymentRef: present(row.payment_ref, "payment_ref", row) };
    case "shipped":
    case "delivered": {
      const shipped = {
        ...placed,
        paidAt: present(row.paid_at, "paid_at", row),
        paymentRef: present(row.payment_ref, "payment_ref", row),
        shippedAt: present(row.shipped_at, "shipped_at", row),
        carrier: present(row.carrier, "carrier", row),
        trackingNumber: present(row.tracking_number, "tracking_number", row),
      };
      return row.status === "shipped"
        ? { ...shipped, status: "shipped" }
        : { ...shipped, status: "delivered", deliveredAt: present(row.delivered_at, "delivered_at", row) };
    }
    case "cancelled":
      return {
        ...placed,
        status: "cancelled",
        cancelledAt: present(row.cancelled_at, "cancelled_at", row),
        cancelReason: present(row.cancel_reason, "cancel_reason", row),
        paidAt: row.paid_at,
        paymentRef: row.payment_ref,
      };
  }
}
