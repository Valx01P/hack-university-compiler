// Compile-only tests of the order types: the transitions only accept the states they start
// from, statusLabel is a union of five labels, and a new order must name its customer.
import type * as z from "zod";
import { ship, type CancelledOrder, type PaidOrder, type PendingOrder } from "#domain/order.ts";
import type { presentOrder } from "#http/views/order-view.ts";
import type { CreateOrderBody } from "#schemas/orders.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const pending: PendingOrder;
declare const paid: PaidOrder;
declare const cancelled: CancelledOrder;
declare const now: Date;
const parcel = { carrier: "ups", trackingNumber: "1Z999AA10123456784" } as const;

export const shipsWhenPaid = ship(paid, parcel, now);
// @ts-expect-error -- a pending order has not been paid, so it cannot ship
export const shipsWhenPending = ship(pending, parcel, now);
// @ts-expect-error -- a cancelled order cannot ship
export const shipsWhenCancelled = ship(cancelled, parcel, now);

export type LabelIsAUnion = Expect<Equal<ReturnType<typeof presentOrder>["statusLabel"], "Pending" | "Paid" | "Shipped" | "Delivered" | "Cancelled">>;

// @ts-expect-error -- customerId is required
export const withoutCustomer: z.input<typeof CreateOrderBody> = { lines: [{ sku: "COF-ETH-250", quantity: 1 }] };
