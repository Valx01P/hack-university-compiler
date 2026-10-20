// The client against the mock: typed answers, and each kind of failure becoming the right
// ParcellyError. Retries are on, with a sleep that returns at once, so the tests stay fast.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { isShipmentId, ParcellyError, type ShipmentId } from "../src/index.ts";
import { startMock, type TestMock } from "./mock.ts";

function id(text: string): ShipmentId {
  assert.ok(isShipmentId(text));
  return text;
}

let mock: TestMock;
before(async () => {
  mock = await startMock();
});
after(async () => {
  await mock.close();
});

describe("reading", () => {
  test("shipments.get returns a typed shipment", async () => {
    const shipment = await mock.client().shipments.get(id("SHP-1001"));
    assert.equal(shipment.status, "in_transit");
    assert.equal(shipment.carrier, "ups");
    assert.equal(shipment.eta, "2026-10-03T20:00:00Z");
    assert.equal(shipment.to.city, "Denver");
  });

  test("a USPS shipment has no ETA", async () => {
    assert.equal((await mock.client().shipments.get(id("SHP-1003"))).eta, null);
  });

  test("carriers.list returns all four carriers", async () => {
    const carriers = await mock.client().carriers.list();
    assert.deepEqual(
      carriers.map((carrier) => carrier.id),
      ["ups", "dhl", "usps", "parcelly-ground"],
    );
    assert.equal(carriers[0]?.supportsSignature, true);
  });

  test("events.list returns the timeline, oldest first", async () => {
    const events = await mock.client().events.list(id("SHP-1002"));
    assert.deepEqual(
      events.map((event) => event.type),
      ["label_created", "picked_up", "in_transit", "in_transit", "in_transit", "out_for_delivery", "delivered"],
    );
    const delivered = events.at(-1);
    assert.equal(delivered?.type === "delivered" ? delivered.signedBy : undefined, "G. Hopper");
  });

});

describe("failures", () => {
  test("a wrong key is an http error with Parcelly's code, asked once", async () => {
    const before = mock.calls.length;
    await assert.rejects(mock.client({ apiKey: "nope" }).shipments.get(id("SHP-1001")), (error: unknown) => {
      assert.ok(error instanceof ParcellyError);
      assert.equal(error.kind, "http");
      assert.equal(error.status, 401);
      assert.equal(error.details.code, "unauthorized");
      return true;
    });
    assert.equal(mock.calls.length - before, 1);
  });

  test("an unknown shipment is an http 404", async () => {
    await assert.rejects(mock.client().shipments.get(id("SHP-9999")), { name: "ParcellyError", kind: "http", message: "No shipment SHP-9999" });
  });

  test("a body that breaks the contract is a validation error", async () => {
    await assert.rejects(mock.client({ headers: { "x-mock-garbage": "1" } }).shipments.list(), (error: unknown) => {
      assert.ok(error instanceof ParcellyError);
      assert.equal(error.kind, "validation");
      assert.ok(error.details.issues && error.details.issues.length > 0);
      return true;
    });
  });

  test("a slow answer is a timeout", async () => {
    const client = mock.client({ timeoutMs: 50, headers: { "x-mock-delay": "300" }, retry: { attempts: 1 } });
    await assert.rejects(client.shipments.get(id("SHP-1001")), { name: "ParcellyError", kind: "timeout" });
  });

  test("a closed port is a network error", async () => {
    const client = mock.client({ baseUrl: "http://127.0.0.1:9", retry: { attempts: 1 } });
    await assert.rejects(client.shipments.get(id("SHP-1001")), { name: "ParcellyError", kind: "network" });
  });
});
