// Builders for test data. Each returns a valid object with sensible defaults, and a test
// overrides only the fields it is about, so what matters in a test stands out:
// aPaidOrder({ paymentRef: "" }) reads as "a paid order whose reference is empty".
import type { Customer } from "#domain/customer.ts";
import { isCustomerId, isSku, orderIdFor, type CustomerId, type Sku } from "#domain/ids.ts";
import { cents } from "#domain/money.ts";
import type { CancelledOrder, DeliveredOrder, OrderLine, PaidOrder, PendingOrder, ShippedOrder } from "#domain/order.ts";
import type { Product } from "#domain/product.ts";

export function customerId(text: string): CustomerId {
  if (!isCustomerId(text)) throw new Error(`Not a customer id: ${text}`);
  return text;
}

export function sku(text: string): Sku {
  if (!isSku(text)) throw new Error(`Not a SKU: ${text}`);
  return text;
}

export function aCustomer(overrides: Partial<Customer> = {}): Customer {
  return { id: customerId("cus_01"), name: "Ada Lovelace", email: "ada@example.com", ...overrides };
}

export function aProduct(overrides: Partial<Product> = {}): Product {
  return { sku: sku("COF-ETH-250"), name: "Ethiopia Yirgacheffe 250 g", priceCents: cents(1450), stock: 40, ...overrides };
}

export function aLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return { sku: sku("COF-ETH-250"), name: "Ethiopia Yirgacheffe 250 g", quantity: 2, unitPriceCents: cents(1450), ...overrides };
}

export function aPendingOrder(overrides: Partial<PendingOrder> = {}): PendingOrder {
  return {
    id: orderIdFor(1),
    customerId: customerId("cus_01"),
    lines: [aLine()],
    note: null,
    createdAt: new Date("2026-09-30T10:00:00.000Z"),
    status: "pending",
    ...overrides,
  };
}

export function aPaidOrder(overrides: Partial<PaidOrder> = {}): PaidOrder {
  return { ...aPendingOrder(), status: "paid", paidAt: new Date("2026-09-30T10:05:00.000Z"), paymentRef: "pay_0001", ...overrides };
}

export function aShippedOrder(overrides: Partial<ShippedOrder> = {}): ShippedOrder {
  return {
    ...aPaidOrder(),
    status: "shipped",
    shippedAt: new Date("2026-09-30T16:00:00.000Z"),
    carrier: "ups",
    trackingNumber: "1Z999AA10123456784",
    ...overrides,
  };
}

export function aDeliveredOrder(overrides: Partial<DeliveredOrder> = {}): DeliveredOrder {
  return { ...aShippedOrder(), status: "delivered", deliveredAt: new Date("2026-10-01T08:00:00.000Z"), ...overrides };
}

export function aCancelledOrder(overrides: Partial<CancelledOrder> = {}): CancelledOrder {
  return {
    ...aPendingOrder(),
    status: "cancelled",
    cancelledAt: new Date("2026-09-30T11:00:00.000Z"),
    cancelReason: "Changed my mind",
    paidAt: null,
    paymentRef: null,
    ...overrides,
  };
}
