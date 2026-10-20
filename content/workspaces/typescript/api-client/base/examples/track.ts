// npm run demo -- SHP-1001: prints one shipment's timeline, the way a support tool would. It
// is the SDK's first real user: it imports only from src/index.ts, and reads the API key and
// base URL from the environment (.env).
import { createClient, formatEta, formatEvent, formatWeight, isShipmentId, ParcellyError } from "../src/index.ts";

const id = process.argv[2] ?? "";
const apiKey = process.env["PARCELLY_API_KEY"];
// An empty PARCELLY_BASE_URL means the local mock, on the port the workspace gave it.
const baseUrl = process.env["PARCELLY_BASE_URL"] || `http://localhost:${process.env["MOCK_PORT"] ?? "4010"}`;

if (!isShipmentId(id)) {
  console.error("Usage: npm run demo -- SHP-1001");
  process.exitCode = 2;
} else if (!apiKey) {
  console.error("Set PARCELLY_API_KEY (see .env.example)");
  process.exitCode = 2;
} else {
  const client = createClient({ apiKey, baseUrl });
  try {
    const shipment = await client.shipments.get(id);
    const carriers = await client.carriers.list();
    const carrier = carriers.find((candidate) => candidate.id === shipment.carrier)?.name ?? shipment.carrier;
    console.log(`${shipment.id}  ${shipment.status.replaceAll("_", " ")} with ${carrier}  ${formatWeight(shipment.weightGrams)}`);
    console.log(formatEta(shipment));
    for (const event of await client.events.list(id)) console.log(formatEvent(event));
  } catch (error) {
    if (!(error instanceof ParcellyError)) throw error;
    console.error(`${error.kind}: ${error.message}`);
    process.exitCode = 1;
  }
}
