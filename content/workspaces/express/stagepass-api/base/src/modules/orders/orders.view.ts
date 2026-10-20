// The view: orders as clients see them. Money stays in whole cents, and each line's subtotal is
// worked out here so clients never multiply prices themselves.
import type { z } from "zod";
import type { OrderResponse, OrderSummaryResponse } from "./orders.schemas.ts";
import type { OrderDetail, OrderSummary } from "./orders.repository.ts";

export function toOrderJson(order: OrderDetail): z.infer<typeof OrderResponse> {
  return {
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    event: {
      id: order.event.id,
      title: order.event.title,
      slug: order.event.slug,
      startsAt: order.event.startsAt.toISOString(),
    },
    items: order.items.map((item) => ({
      ticketTypeId: item.ticketTypeId,
      name: item.ticketTypeName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      subtotalCents: item.quantity * item.unitPriceCents,
    })),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}

export function toOrderSummaryJson(order: OrderSummary): z.infer<typeof OrderSummaryResponse> {
  return {
    id: order.id,
    status: order.status,
    eventId: order.eventId,
    eventTitle: order.eventTitle,
    eventStartsAt: order.eventStartsAt.toISOString(),
    totalCents: order.totalCents,
    ticketCount: order.ticketCount,
    createdAt: order.createdAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}
