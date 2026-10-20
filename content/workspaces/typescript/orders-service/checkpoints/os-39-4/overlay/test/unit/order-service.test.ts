// Tests for OrderService with in-memory repositories and a fixed clock: no database, no
// HTTP, and every rule checked through the service's public methods. Listeners are typed
// mocks (mock.fn), so a test can read exactly what was emitted.
import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { fixedClock } from "../../src/clock.ts";
import { orderIdFor } from "#domain/ids.ts";
import type { CancelledOrder, Order } from "#domain/order.ts";
import { memoryRepositories, type MemorySeed } from "#repositories/memory/repositories.ts";
import { createOrderEvents } from "#services/events.ts";
import { HookRegistry } from "#services/hooks.ts";
import { OrderService } from "#services/order-service.ts";
import { ProductService } from "#services/product-service.ts";
import { aCustomer, aPaidOrder, aPendingOrder, aProduct, aShippedOrder, customerId, sku } from "../helpers/builders.ts";

const clock = fixedClock("2026-10-01T09:00:00Z");

function setup(seed: MemorySeed = {}) {
  const repositories = memoryRepositories({ customers: [aCustomer()], products: [aProduct()], ...seed });
  const events = createOrderEvents();
  const products = new ProductService(repositories.products);
  const hooks = new HookRegistry();
  return { repositories, events, service: new OrderService({ repositories, products, hooks, events, clock }) };
}

describe("OrderService.createOrder", () => {
  test("prices the lines from the catalog, takes the stock, and emits order.created", () => {
    const { repositories, events, service } = setup();
    const created = mock.fn<(order: Order) => void>();
    events.on("order.created", created);
    const result = service.createOrder({ customerId: customerId("cus_01"), lines: [{ sku: sku("COF-ETH-250"), quantity: 3 }], note: "for the office" });
    assert.ok(result.ok);
    assert.equal(result.value.id, "ord_0001");
    assert.deepEqual(result.value.lines[0], { sku: "COF-ETH-250", name: "Ethiopia Yirgacheffe 250 g", quantity: 3, unitPriceCents: 1450 });
    assert.equal(result.value.note, "for the office");
    assert.equal(repositories.products.findBySku(sku("COF-ETH-250"))?.stock, 37);
    assert.equal(created.mock.callCount(), 1);
    assert.equal(created.mock.calls[0]?.arguments[0].id, "ord_0001");
  });

  test("an order that asks for more than the shelf holds takes nothing", () => {
    const { repositories, service } = setup({ products: [aProduct({ stock: 2 })] });
    const result = service.createOrder({ customerId: customerId("cus_01"), lines: [{ sku: sku("COF-ETH-250"), quantity: 3 }] });
    assert.deepEqual(result, { ok: false, error: { type: "out_of_stock", sku: "COF-ETH-250", requested: 3, available: 2 } });
    assert.equal(repositories.products.findBySku(sku("COF-ETH-250"))?.stock, 2);
  });

  test("an unknown customer or SKU is a validation error with the field's path", () => {
    const { service } = setup();
    const noCustomer = service.createOrder({ customerId: customerId("cus_99"), lines: [{ sku: sku("COF-ETH-250"), quantity: 1 }] });
    assert.deepEqual(noCustomer, { ok: false, error: { type: "validation", issues: [{ path: "customerId", message: "No customer with id cus_99" }] } });
    const noProduct = service.createOrder({ customerId: customerId("cus_01"), lines: [{ sku: sku("GEA-XXX-01"), quantity: 1 }] });
    assert.deepEqual(noProduct, { ok: false, error: { type: "validation", issues: [{ path: "lines[0].sku", message: "No product with SKU GEA-XXX-01" }] } });
  });
});

describe("OrderService.pay and ship", () => {
  test("paying a pending order saves it as paid and emits order.paid", () => {
    const { repositories, events, service } = setup({ orders: [aPendingOrder()] });
    const paid = mock.fn<(order: Order) => void>();
    events.on("order.paid", paid);
    const result = service.pay(orderIdFor(1), "pay_0042");
    assert.ok(result.ok);
    assert.equal(repositories.orders.findById(orderIdFor(1))?.status, "paid");
    assert.equal(paid.mock.callCount(), 1);
  });

  test("a pending order cannot ship", () => {
    const { service } = setup({ orders: [aPendingOrder()] });
    assert.deepEqual(service.ship(orderIdFor(1), { carrier: "ups", trackingNumber: "1Z999AA10123456784" }), {
      ok: false,
      error: { type: "invalid_transition", from: "pending", to: "shipped" },
    });
  });

  test("a shipped order can be delivered once", () => {
    const { service } = setup({ orders: [aShippedOrder()] });
    assert.equal(service.deliver(orderIdFor(1)).ok, true);
    assert.deepEqual(service.deliver(orderIdFor(1)), { ok: false, error: { type: "invalid_transition", from: "delivered", to: "delivered" } });
  });
});

describe("OrderService.cancel", () => {
  test("cancelling a paid order saves it and emits order.cancelled", () => {
    const { repositories, events, service } = setup({ orders: [aPaidOrder()] });
    const cancelled = mock.fn<(order: CancelledOrder) => void>();
    events.on("order.cancelled", cancelled);
    const result = service.cancel(orderIdFor(1), "Ordered twice");
    assert.ok(result.ok);
    assert.equal(repositories.orders.findById(orderIdFor(1))?.status, "cancelled");
    assert.equal(cancelled.mock.callCount(), 1);
    assert.equal(cancelled.mock.calls[0]?.arguments[0].cancelReason, "Ordered twice");
  });

  test("a shipped order cannot be cancelled", () => {
    const { service } = setup({ orders: [aShippedOrder()] });
    assert.deepEqual(service.cancel(orderIdFor(1), "Too late"), { ok: false, error: { type: "invalid_transition", from: "shipped", to: "cancelled" } });
  });

  test("an unknown order is not found", () => {
    const { service } = setup();
    assert.deepEqual(service.cancel(orderIdFor(9), "Nope"), { ok: false, error: { type: "not_found", entity: "order", id: "ord_0009" } });
  });
});
