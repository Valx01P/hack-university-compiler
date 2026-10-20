// Compile-only tests of the SDK's types: npm run typecheck compiles this file and nothing runs
// it. Each @ts-expect-error must really be an error, or tsc reports TS2578.
import { createClient, type Shipment, type TrackingEvent } from "../src/index.ts";

declare const event: TrackingEvent;

// A switch on type narrows each event to its own fields.
export function describeEvent(): string {
  switch (event.type) {
    case "delivered":
      return event.signedBy ?? "left at the door";
    case "exception":
      return event.reason;
    default:
      // @ts-expect-error -- only delivered events have signedBy
      return event.signedBy;
  }
}

const client = createClient({ apiKey: "test_key_123", baseUrl: "http://localhost:4010" });

// @ts-expect-error -- a plain string is not a ShipmentId; check it with isShipmentId first
export const fromString = client.shipments.get("SHP-1001");

export const eta: Shipment["eta"] = null;
