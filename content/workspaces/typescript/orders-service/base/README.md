# Bramble Coffee orders API

The order service of a small coffee roaster: customers order beans and brewing gear, and
staff take each order from pending to paid, shipped, and delivered (or cancelled). It is a
plain `node:http` server with a SQLite database through `node:sqlite`, written in the layered
style most TypeScript backends use. Node 26 runs the TypeScript directly, so there is no build
step, and TypeScript 7 checks it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the server and restarts it when a file changes (`node --watch`). Run starts this |
| `npm start` | Starts the server once |
| `npm run db:reset` | Rebuilds `data/bramble.db` from `db/migrations` and `db/seed.sql` in about 100 ms. A running server sees the fresh data at once |
| `npm run db:query -- "SELECT ..."` | Runs one SQL statement and prints the rows as a table |
| `npm run typecheck` | `tsc`: checks `src`, `test`, `scripts`, and `type-tests` |
| `npm run lint` | ESLint with typescript-eslint's type-aware rules |
| `npm test` | Every test (`npm run test:unit` and `npm run test:http` run one half) |
| `npm run check` | typecheck, then lint, then test, stopping at the first failure |

The server prints the address it listens on (`listening on http://localhost:23017`), which
works in the API panel, a new tab, and the terminal: `curl -s "localhost:$PORT/orders/ord_0003" | jq`.
The first start builds the database if it is missing. `requests.http` has one request for
every endpoint.

## Endpoints

| Method and path | What it does |
| --- | --- |
| `GET /health` | `{"status":"ok"}` while the server is up |
| `GET /products` | The catalog |
| `GET /products/:sku` | One product, 404 for an unknown SKU |
| `GET /products/:sku/availability` | `{ sku, inStock, stock }` |
| `GET /orders?status=&limit=&cursor=` | Orders newest first, at most `limit` (1 to 50, default 20), with `nextCursor` for the next page |
| `GET /orders/:id` | One order |
| `POST /orders` | Places an order: `{ customerId, lines: [{ sku, quantity }], note? }`. Prices come from the catalog |
| `POST /orders/:id/pay` | `{ paymentRef }`, for a pending order |
| `POST /orders/:id/ship` | `{ carrier, trackingNumber }`, for a paid order |
| `POST /orders/:id/deliver` | For a shipped order |
| `POST /orders/:id/cancel` | `{ reason }`, for a pending or paid order |
| `GET /customers/:customerId/orders` | One customer's orders, newest first |
| `GET /reports/daily?date=2026-09-30` | One day's orders and their value by status, and the revenue |

Errors are `application/problem+json`: `{ type, title, status, detail, code, issues }`. A bad
query string is 400, an unknown id 404, a change the order's state does not allow 409
(`invalid_transition`, `out_of_stock`), and a body with invalid fields 422, with one issue per
field (`lines[0].quantity`).

## How the code is laid out

The model, view, and controller pattern, as APIs use it, plus services and repositories:

```text
src/server.ts            entry point: settings, database, listen on PORT, close on SIGINT and SIGTERM
src/app.ts               composition root: repositories -> services -> controllers -> routes
src/config.ts            the environment, checked by a zod schema
src/clock.ts, logger.ts  the injected clock (HU_FIXED_TIME) and the JSON logger
src/domain/              the Model: orders as a union of five states, money in cents, ids as brands. No I/O
src/schemas/             zod schemas for what clients send: bodies and the query string
src/services/            the rules: OrderService, ProductService, the pre-save hooks, the events
src/repositories/        interfaces (types.ts), the SQLite versions, and in-memory versions for tests
src/http/                the router, the middleware, and the Controllers and Views
src/reports/daily.ts     the daily report, one SQL query across tables
db/                      migrations and the seed
scripts/                 db:reset and db:query
test/                    unit tests, HTTP tests, and builders
type-tests/              compile-only tests that tsc checks and nothing runs
```

Imports go one way: `http` uses `services`, `services` use `repositories` (through their
interfaces) and `domain`, and `domain` uses nothing. Only `app.ts` knows every layer. The
folders are `#` subpath imports in `package.json` (`#domain/order.ts`), so Node resolves them
with no build step.

Lessons often start from a version of this service with one piece missing or changed, which
each part names.

## One request through every layer

`POST /orders` with `{"customerId":"cus_04","lines":[{"sku":"COF-ETH-250","quantity":2}]}`:

1. `src/http/middleware.ts` gives the request an id (`req-1`, sent back as `x-request-id`),
   starts its SQL statement count, and calls the router.
2. `src/http/router.ts` matches `POST /orders` and calls `create` in
   `src/http/controllers/orders.ts`. The pattern's `:params` are typed by `ExtractParams`.
3. The controller reads the body as `unknown` and checks it with `CreateOrderBody` from
   `src/schemas/orders.ts`. A bad field stops here with 422 and the field's path.
4. `OrderService.createOrder` in `src/services/order-service.ts` checks the customer, asks
   `ProductService.priceLines` for the catalog's prices, and opens a transaction.
5. Inside it, the `beforeCreateOrder` hooks from `src/services/hooks.ts` run
   (`normalizeNote`, `limitQuantity`), `reserveStock` takes the stock, and
   `SqliteOrderRepository.create` in `src/repositories/sqlite/order-repo.ts` inserts the order
   and its lines with the next id, `ord_0013`. Any error rolls all of it back.
6. After the commit, the service emits `order.created`, and the listener in `src/app.ts`
   writes an audit row to `order_events` and a log line.
7. The controller turns the domain `Order` into JSON with `presentOrder` from
   `src/http/views/order-view.ts` and answers 201 with a `Location` header.
8. The middleware writes the access log line: method, path, status, `duration_ms`, and the
   number of SQL statements the request ran.

## Data

`db/seed.sql`: customers `cus_01` Ada Lovelace, `cus_02` Grace Hopper, `cus_03` Alan Turing,
and `cus_04` Katherine Johnson (no orders); 8 products, from `COF-ETH-250` (14.50, 40 in
stock) to `GEA-FLT-100` (sold out); and 12 orders, `ord_0001` to `ord_0012`, from 2026-09-20
to 2026-09-30: 3 pending, 3 paid, 3 shipped, 2 delivered, and 1 cancelled. The workspace's
clock is fixed at 2026-10-01T09:00:00Z (`HU_FIXED_TIME`), so new orders get that time.

`.env` holds the settings (`.env.example` documents each one). The tests never touch
`data/bramble.db`: they use in-memory repositories or a SQLite database in memory built from
the same migrations and seed.
