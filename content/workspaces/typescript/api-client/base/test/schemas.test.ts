// The schemas on their own: what they accept, what they refuse, and the v2 shipment format
// arriving as the same Shipment type.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TrackingEvent } from "../src/schemas/event.ts";
import { AnyShipment, Shipment } from "../src/schemas/shipment.ts";

const address = { name: "Ada Lovelace", city: "Denver", region: "CO", postalCode: "80202", country: "US" };
const shipment = {
  id: "SHP-1001",
  status: "in_transit",
  carrier: "ups",
  trackingNumber: "1Z999AA10123456784",
  weightGrams: 2400,
  eta: "2026-10-03T20:00:00Z",
  from: address,
  to: address,
  createdAt: "2026-09-25T09:00:00Z",
};

test("a shipment's eta may be null, but not missing", () => {
  assert.equal(Shipment.safeParse({ ...shipment, eta: null }).success, true);
  const { eta, ...noEta } = shipment;
  assert.equal(eta, "2026-10-03T20:00:00Z");
  assert.equal(Shipment.safeParse(noEta).success, false);
});

test("an unknown status or a bad id is refused", () => {
  assert.equal(Shipment.safeParse({ ...shipment, status: "lost" }).success, false);
  assert.equal(Shipment.safeParse({ ...shipment, id: "1001" }).success, false);
});

test("a v2 shipment becomes the same Shipment", () => {
  const { eta, carrier, ...rest } = shipment;
  const v2 = { ...rest, carrier: { id: carrier, name: "UPS" }, estimatedDelivery: eta };
  assert.deepEqual(AnyShipment.parse(v2), Shipment.parse(shipment));
});

test("events are told apart by their type", () => {
  const event = TrackingEvent.parse({ id: "EVT-0001", shipmentId: "SHP-1002", type: "delivered", at: "2026-09-28T14:25:00Z", location: "Arlington, VA", signedBy: null });
  assert.equal(event.type === "delivered" ? event.signedBy : "not a delivery", null);
  assert.equal(TrackingEvent.safeParse({ id: "EVT-0002", shipmentId: "SHP-1002", type: "delivered", at: "2026-09-28T14:25:00Z" }).success, false);
});
