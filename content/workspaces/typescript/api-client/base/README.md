# Parcelly SDK

A TypeScript SDK for Parcelly, a parcel-tracking API, the kind of client every company writes
for a vendor's API. It wraps `fetch` with the API key and a timeout, treats every response
body as `unknown` until a zod schema has checked it, turns failures into typed errors,
retries what is safe to retry, and walks paged lists as an async generator. `mock-api/` is a
local copy of Parcelly ("the vendor's server"), so everything runs offline.

```ts
import { createClient, isShipmentId } from "./src/index.ts";

// The mock listens on MOCK_PORT, the port the workspace gave it (4010 outside Hack University).
const client = createClient({ apiKey: "test_key_123", baseUrl: `http://localhost:${process.env["MOCK_PORT"] ?? "4010"}` });
const id = "SHP-1001";
if (isShipmentId(id)) console.log((await client.shipments.get(id)).status); // in_transit
// Every page, one shipment at a time: SHP-1001, SHP-1004, SHP-1006, SHP-1009, SHP-1011
for await (const shipment of client.shipments.all({ status: "in_transit" })) console.log(shipment.id);
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run mock` | Starts the mock on `MOCK_PORT` (Run does this). It prints its address |
| `npm run demo -- SHP-1001` | Prints a shipment's timeline through the SDK (`examples/track.ts`) |
| `npm run dev` | The demo for SHP-1001 again on every save |
| `npm run typecheck` | `tsc`: checks `src`, `mock-api`, `examples`, `test`, and `type-tests` |
| `npm test` | Every test. Each test file starts its own mock on a free port |
| `npm run check` | typecheck, then test |

`curl -s -H "Authorization: Bearer test_key_123" "localhost:$MOCK_PORT/v1/carriers" | jq`
asks the mock directly, and `requests.http` has a request for every endpoint.

## The SDK

| Method | Endpoint | Returns |
| --- | --- | --- |
| `shipments.get(id)` | `GET /v1/shipments/:id` | `Promise<Shipment>` |
| `shipments.list({ status, limit, cursor })` | `GET /v1/shipments` | one `Page<Shipment>` |
| `shipments.all({ status }, pageSize?)` | every page of `GET /v1/shipments` | `AsyncGenerator<Shipment>` |
| `shipments.getV2(id)` | `GET /v2/shipments/:id` | the same `Shipment`, from the v2 format |
| `events.list(id)` | `GET /v1/shipments/:id/events` | `Promise<TrackingEvent[]>`, a union on `type` |
| `carriers.list()` | `GET /v1/carriers` | `Promise<Carrier[]>` |

Every failure is a `ParcellyError` with a `kind`: `http` (with `status` and Parcelly's
`code`), `rate_limited` (with `retryAfterMs`), `validation` (the body broke the contract),
`network`, or `timeout`. Rate limits, network trouble, timeouts, and 502 to 504 are retried
3 times, after 100 and 200 ms, or after as long as `Retry-After` says. Anything else fails
at once: asking again for something that does not exist will not make it exist.

## How the code is laid out

```text
src/index.ts          the public API: everything a caller may import
src/client.ts         createClient: one method per endpoint
src/http.ts           the one place that calls fetch: URL, key, timeout, errors, schema check
src/errors.ts         ParcellyError and isRetryable
src/retry.ts          withRetry, with exponential backoff and an injected sleep
src/paginate.ts       paginate: cursor pages as an async generator
src/schemas/          zod schemas for each thing Parcelly sends, from openapi.yaml
src/types.ts          the types inferred from those schemas, and the ShipmentId brand
src/format.ts         lines for people: an ETA, a weight, an event
examples/track.ts     the demo, the SDK's first user
mock-api/             the vendor's server: data, chaos headers, the v2 format
openapi.yaml          Parcelly's contract (and, like real ones, not quite what the API does)
test/                 node:test tests against the mock, and test/mock.ts to start one
type-tests/           compile-only tests that tsc checks and nothing runs
```

## One call, through every layer

`client.shipments.get(id)` for `SHP-1001`:

1. `src/client.ts` maps it to `GET /v1/shipments/SHP-1001` with the `Shipment` schema, and
   wraps the call in `withRetry`.
2. `src/retry.ts` calls it, and on a failure asks `isRetryable` (`src/errors.ts`) whether to
   wait (100 ms, then 200 ms, or what `Retry-After` says) and try again.
3. `src/http.ts` builds the URL from the base URL, adds `Authorization: Bearer` and a
   5 second `AbortSignal.timeout`, and calls `fetch`.
4. `mock-api/server.ts` checks the key, applies any chaos header (`mock-api/chaos.ts`),
   finds the shipment in `mock-api/data.ts`, and answers with JSON.
5. Back in `http.ts`, the body arrives as `unknown`. A 4xx or 5xx becomes a `ParcellyError`
   from the error envelope, and a 200 goes through `Shipment.safeParse`
   (`src/schemas/shipment.ts`), so what returns is a checked `Shipment`, or a `validation`
   error naming the field that broke the contract.
6. The caller gets `Promise<Shipment>`, typed by the schema it was checked with.

## The mock

12 shipments (`SHP-1001` to `SHP-1012`: 2 with a label created, 5 in transit, 1 out for
delivery, 3 delivered, and 1 with an exception), 61 tracking events from 2026-09-25 to
2026-10-01, and 4 carriers (`ups`, `dhl`, `usps`, `parcelly-ground`). USPS shipments have no
ETA. Lists page 5 at a time with an opaque cursor. The key is `test_key_123` (`.env` sets
`PARCELLY_API_KEY`, and `.env.example` documents it).

Headers that make it misbehave, for testing the SDK: `x-mock-fail: 503x2` (fail twice, then
answer), `x-mock-rate-limit: 1` (429 with `Retry-After: 1`), `x-mock-delay: 1500` (answer
late), and `x-mock-garbage: 1` (a 200 that breaks the contract). `MOCK_DHL_NULL_ETA=1` makes
DHL drop its ETAs too.
