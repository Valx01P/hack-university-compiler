// What clients may send about orders, as zod schemas: request bodies and the list's query
// string. Everything a client sends is unknown until one of these has checked it, and the
// types the controllers pass on are inferred from the same schemas. strictObject rejects
// keys it does not know, so a client cannot slip in a field such as a price.
import * as z from "zod";
import { CARRIERS, ORDER_STATUSES } from "#domain/order.ts";
import { Cursor, CustomerIdField, Limit, SkuField } from "./common.ts";

const LineInput = z.strictObject({
  sku: SkuField,
  quantity: z.number().int().min(1).max(99),
});

export const CreateOrderBody = z.strictObject({
  customerId: CustomerIdField.optional(),
  lines: z
    .array(LineInput)
    .min(1)
    .max(20)
    .refine((lines) => new Set(lines.map((line) => line.sku)).size === lines.length, "each SKU may appear once"),
  note: z.string().max(1000).optional(),
});
export type CreateOrderBody = z.output<typeof CreateOrderBody>;

export const PayBody = z.strictObject({ paymentRef: z.string().trim().min(1).max(64) });

export const ShipBody = z.strictObject({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().regex(/^[A-Z0-9]{8,30}$/, "expected 8 to 30 capital letters and digits"),
});

export const CancelBody = z.strictObject({ reason: z.string().trim().min(1).max(200) });

export const OrderListQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  limit: Limit,
  cursor: Cursor,
});
