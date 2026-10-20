// What order requests may contain, and the JSON order responses have.
import { z } from "zod";
import { orderStatuses } from "../../db/schema.ts";
import { limitQuery } from "../../http/pagination.ts";
import { idParam } from "../../http/validate.ts";

export const MAX_ITEMS_PER_ORDER = 4;
export const MAX_QUANTITY_PER_ITEM = 10;

export const OrderIdParams = z.object({ orderId: idParam });
export type OrderIdParams = z.infer<typeof OrderIdParams>;

export const Checkout = z.strictObject({
  items: z
    .array(
      z.strictObject({
        ticketTypeId: z.int().positive(),
        quantity: z.int().min(1).max(MAX_QUANTITY_PER_ITEM),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_PER_ORDER)
    .refine((items) => new Set(items.map((item) => item.ticketTypeId)).size === items.length, {
      message: "List each ticket type once, with its total quantity",
    }),
});
export type Checkout = z.infer<typeof Checkout>;

export const ListOrdersQuery = z.object({
  cursor: z.string().max(1000).optional(),
  limit: limitQuery(10),
});
export type ListOrdersQuery = z.infer<typeof ListOrdersQuery>;

const OrderStatus = z.enum(orderStatuses);

export const OrderResponse = z.object({
  id: z.int(),
  status: OrderStatus,
  totalCents: z.int(),
  event: z.object({ id: z.int(), title: z.string(), slug: z.string(), startsAt: z.iso.datetime() }),
  items: z.array(
    z.object({
      ticketTypeId: z.int(),
      name: z.string(),
      quantity: z.int(),
      unitPriceCents: z.int(),
      subtotalCents: z.int(),
    }),
  ),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime(),
  cancelledAt: z.iso.datetime().nullable(),
});

export const OrderSummaryResponse = z.object({
  id: z.int(),
  status: OrderStatus,
  eventId: z.int(),
  eventTitle: z.string(),
  eventStartsAt: z.iso.datetime(),
  totalCents: z.int(),
  ticketCount: z.int(),
  createdAt: z.iso.datetime(),
  cancelledAt: z.iso.datetime().nullable(),
});

export const OrderPageResponse = z.object({
  data: z.array(OrderSummaryResponse),
  nextCursor: z.string().nullable(),
});
