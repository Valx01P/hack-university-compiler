// Parcelly's v2 shipment format, served at /v2/shipments/:id: eta is renamed to
// estimatedDelivery, and carrier becomes an object with the carrier's name. Real vendors
// ship changes like this, and lesson 34 part 4 absorbs them inside the SDK's schemas.
import { carriers, type MockShipment } from "./data.ts";

export function toV2(shipment: MockShipment): Record<string, unknown> {
  const { eta, carrier, ...rest } = shipment;
  const name = carriers.find((candidate) => candidate.id === carrier)?.name ?? carrier;
  return { ...rest, carrier: { id: carrier, name }, estimatedDelivery: eta };
}
