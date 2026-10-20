// The mock's data: 4 carriers, 12 shipments (SHP-1001 to SHP-1012), and their 61 tracking
// events, all at fixed times from 2026-09-25 to 2026-10-01, so every response is the same
// on every run. USPS never sends an ETA, which is why eta can be null.
export type Address = { name: string; city: string; region: string; postalCode: string; country: string };

export type MockCarrier = { id: string; name: string; trackingUrlTemplate: string; supportsSignature: boolean };

export type MockShipment = {
  id: string;
  status: "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  carrier: string;
  trackingNumber: string;
  weightGrams: number;
  eta: string | null;
  from: Address;
  to: Address;
  createdAt: string;
};

export type MockEvent = { id: string; shipmentId: string; type: string; at: string } & Record<string, unknown>;

export const carriers: MockCarrier[] = [
  { id: "ups", name: "UPS", trackingUrlTemplate: "https://www.ups.com/track?tracknum={trackingNumber}", supportsSignature: true },
  { id: "dhl", name: "DHL Express", trackingUrlTemplate: "https://www.dhl.com/track?id={trackingNumber}", supportsSignature: true },
  { id: "usps", name: "USPS", trackingUrlTemplate: "https://tools.usps.com/go/TrackConfirmAction?tLabels={trackingNumber}", supportsSignature: false },
  { id: "parcelly-ground", name: "Parcelly Ground", trackingUrlTemplate: "https://track.parcelly.example/{trackingNumber}", supportsSignature: false },
];

const warehouse: Address = { name: "Bramble Coffee", city: "Austin", region: "TX", postalCode: "78701", country: "US" };
const to = (name: string, city: string, region: string, postalCode: string): Address => ({ name, city, region, postalCode, country: "US" });

export const shipments: MockShipment[] = [
  { id: "SHP-1001", status: "in_transit", carrier: "ups", trackingNumber: "1Z999AA10123456784", weightGrams: 2400, eta: "2026-10-03T20:00:00Z", from: warehouse, to: to("Ada Lovelace", "Denver", "CO", "80202"), createdAt: "2026-09-25T09:00:00Z" },
  { id: "SHP-1002", status: "delivered", carrier: "dhl", trackingNumber: "7350123456", weightGrams: 800, eta: "2026-09-28T18:00:00Z", from: warehouse, to: to("Grace Hopper", "Arlington", "VA", "22201"), createdAt: "2026-09-25T10:30:00Z" },
  { id: "SHP-1003", status: "label_created", carrier: "usps", trackingNumber: "9400111202555842332669", weightGrams: 1200, eta: null, from: warehouse, to: to("Alan Turing", "Portland", "OR", "97201"), createdAt: "2026-09-30T15:00:00Z" },
  { id: "SHP-1004", status: "in_transit", carrier: "dhl", trackingNumber: "7350123457", weightGrams: 3100, eta: "2026-10-04T18:00:00Z", from: warehouse, to: to("Katherine Johnson", "Hampton", "VA", "23666"), createdAt: "2026-09-26T08:15:00Z" },
  { id: "SHP-1005", status: "out_for_delivery", carrier: "ups", trackingNumber: "1Z999AA10123456785", weightGrams: 650, eta: "2026-10-01T20:00:00Z", from: warehouse, to: to("Margaret Hamilton", "Boston", "MA", "02108"), createdAt: "2026-09-26T11:40:00Z" },
  { id: "SHP-1006", status: "in_transit", carrier: "usps", trackingNumber: "9400111202555842332670", weightGrams: 1500, eta: null, from: warehouse, to: to("Linus Torvalds", "Portland", "OR", "97205"), createdAt: "2026-09-27T09:20:00Z" },
  { id: "SHP-1007", status: "exception", carrier: "parcelly-ground", trackingNumber: "PG00012345", weightGrams: 5400, eta: "2026-10-06T20:00:00Z", from: warehouse, to: to("Barbara Liskov", "Cambridge", "MA", "02139"), createdAt: "2026-09-26T14:00:00Z" },
  { id: "SHP-1008", status: "delivered", carrier: "ups", trackingNumber: "1Z999AA10123456786", weightGrams: 950, eta: "2026-09-29T20:00:00Z", from: warehouse, to: to("Edsger Dijkstra", "Austin", "TX", "78712"), createdAt: "2026-09-25T13:10:00Z" },
  { id: "SHP-1009", status: "in_transit", carrier: "parcelly-ground", trackingNumber: "PG00012346", weightGrams: 7200, eta: "2026-10-05T20:00:00Z", from: warehouse, to: to("Frances Allen", "Albany", "NY", "12207"), createdAt: "2026-09-28T10:00:00Z" },
  { id: "SHP-1010", status: "label_created", carrier: "ups", trackingNumber: "1Z999AA10123456787", weightGrams: 300, eta: "2026-10-06T20:00:00Z", from: warehouse, to: to("Donald Knuth", "Stanford", "CA", "94305"), createdAt: "2026-10-01T08:00:00Z" },
  { id: "SHP-1011", status: "in_transit", carrier: "dhl", trackingNumber: "7350123458", weightGrams: 2050, eta: "2026-10-03T18:00:00Z", from: warehouse, to: to("John Backus", "Ithaca", "NY", "14850"), createdAt: "2026-09-28T16:45:00Z" },
  { id: "SHP-1012", status: "delivered", carrier: "usps", trackingNumber: "9400111202555842332671", weightGrams: 1100, eta: null, from: warehouse, to: to("Radia Perlman", "Seattle", "WA", "98101"), createdAt: "2026-09-25T15:30:00Z" },
];

// Each shipment's history, oldest first, as [type, time, extra fields]. The events list
// below gives each one an id and its shipment.
type Step = [type: string, at: string, extra?: Record<string, unknown>];
const hop = (at: string, location: string, facility: string): Step => ["in_transit", at, { location, facility }];

const histories: Record<string, Step[]> = {
  "SHP-1001": [["label_created", "2026-09-25T09:00:00Z"], ["picked_up", "2026-09-25T17:20:00Z", { location: "Austin, TX" }], hop("2026-09-26T03:10:00Z", "Austin, TX", "Austin Hub"), hop("2026-09-27T11:45:00Z", "Dallas, TX", "Dallas Sort Center"), hop("2026-09-29T06:30:00Z", "Amarillo, TX", "Amarillo Depot"), hop("2026-09-30T22:15:00Z", "Denver, CO", "Denver Hub")],
  "SHP-1002": [["label_created", "2026-09-25T10:30:00Z"], ["picked_up", "2026-09-25T16:05:00Z", { location: "Austin, TX" }], hop("2026-09-26T01:40:00Z", "Austin, TX", "Austin Gateway"), hop("2026-09-27T09:15:00Z", "Cincinnati, OH", "CVG Hub"), hop("2026-09-28T05:50:00Z", "Arlington, VA", "Arlington Station"), ["out_for_delivery", "2026-09-28T08:10:00Z", { location: "Arlington, VA" }], ["delivered", "2026-09-28T14:25:00Z", { location: "Arlington, VA", signedBy: "G. Hopper" }]],
  "SHP-1003": [["label_created", "2026-09-30T15:00:00Z"]],
  "SHP-1004": [["label_created", "2026-09-26T08:15:00Z"], ["picked_up", "2026-09-26T16:30:00Z", { location: "Austin, TX" }], hop("2026-09-27T02:00:00Z", "Austin, TX", "Austin Gateway"), hop("2026-09-29T12:20:00Z", "Cincinnati, OH", "CVG Hub")],
  "SHP-1005": [["label_created", "2026-09-26T11:40:00Z"], ["picked_up", "2026-09-26T17:00:00Z", { location: "Austin, TX" }], hop("2026-09-27T04:30:00Z", "Austin, TX", "Austin Hub"), hop("2026-09-29T10:10:00Z", "Louisville, KY", "Worldport"), hop("2026-09-30T23:40:00Z", "Boston, MA", "Boston Hub"), ["out_for_delivery", "2026-10-01T07:15:00Z", { location: "Boston, MA" }]],
  "SHP-1006": [["label_created", "2026-09-27T09:20:00Z"], ["picked_up", "2026-09-27T15:50:00Z", { location: "Austin, TX" }], hop("2026-09-28T08:00:00Z", "Austin, TX", "Austin P&DC"), hop("2026-09-29T19:35:00Z", "Phoenix, AZ", "Phoenix NDC"), hop("2026-09-30T21:05:00Z", "Sacramento, CA", "Sacramento NDC"), hop("2026-10-01T06:40:00Z", "Portland, OR", "Portland P&DC")],
  "SHP-1007": [["label_created", "2026-09-26T14:00:00Z"], ["picked_up", "2026-09-26T18:45:00Z", { location: "Austin, TX" }], hop("2026-09-27T07:30:00Z", "Austin, TX", "Ground Terminal 4"), hop("2026-09-29T03:00:00Z", "Nashville, TN", "Ground Terminal 9"), hop("2026-09-30T16:25:00Z", "Cambridge, MA", "Ground Terminal 12"), ["exception", "2026-10-01T08:30:00Z", { location: "Cambridge, MA", reason: "address_issue", message: "No apartment number on the label" }]],
  "SHP-1008": [["label_created", "2026-09-25T13:10:00Z"], ["picked_up", "2026-09-25T17:55:00Z", { location: "Austin, TX" }], hop("2026-09-26T05:20:00Z", "Austin, TX", "Austin Hub"), hop("2026-09-27T21:30:00Z", "San Antonio, TX", "San Antonio Hub"), hop("2026-09-28T23:10:00Z", "Austin, TX", "Austin Hub"), ["out_for_delivery", "2026-09-29T08:30:00Z", { location: "Austin, TX" }], ["delivered", "2026-09-29T15:45:00Z", { location: "Austin, TX", signedBy: null }]],
  "SHP-1009": [["label_created", "2026-09-28T10:00:00Z"], ["picked_up", "2026-09-28T17:30:00Z", { location: "Austin, TX" }], hop("2026-09-29T06:15:00Z", "Austin, TX", "Ground Terminal 4"), hop("2026-09-30T14:50:00Z", "Memphis, TN", "Ground Terminal 7")],
  "SHP-1010": [["label_created", "2026-10-01T08:00:00Z"]],
  "SHP-1011": [["label_created", "2026-09-28T16:45:00Z"], ["picked_up", "2026-09-28T19:20:00Z", { location: "Austin, TX" }], hop("2026-09-29T04:35:00Z", "Austin, TX", "Austin Gateway"), hop("2026-09-30T13:00:00Z", "Cincinnati, OH", "CVG Hub"), hop("2026-10-01T05:25:00Z", "Syracuse, NY", "Syracuse Station"), hop("2026-10-01T07:50:00Z", "Ithaca, NY", "Ithaca Station")],
  "SHP-1012": [["label_created", "2026-09-25T15:30:00Z"], ["picked_up", "2026-09-25T18:10:00Z", { location: "Austin, TX" }], hop("2026-09-26T09:00:00Z", "Austin, TX", "Austin P&DC"), hop("2026-09-27T20:20:00Z", "Denver, CO", "Denver NDC"), hop("2026-09-29T02:30:00Z", "Seattle, WA", "Seattle NDC"), ["out_for_delivery", "2026-09-30T07:40:00Z", { location: "Seattle, WA" }], ["delivered", "2026-09-30T13:05:00Z", { location: "Seattle, WA", signedBy: null }]],
};

let next = 0;
export const events: MockEvent[] = shipments.flatMap((shipment) =>
  (histories[shipment.id] ?? []).map(([type, at, extra]) => ({
    id: `EVT-${String(++next).padStart(4, "0")}`,
    shipmentId: shipment.id,
    type,
    at,
    ...extra,
  })),
);
