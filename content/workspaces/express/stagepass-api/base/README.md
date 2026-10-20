# StagePass API

Ticketing for small venues: admins manage venues, organizers create events and their ticket
types, and customers buy tickets. It is written the way a current Node team writes an API:
TypeScript run directly by Node 26 (no build step), Express 5, PostgreSQL through Drizzle ORM,
zod validation, and one folder per feature. TypeScript 7 (`tsc`) checks it, and Vitest tests it.

## Run it

`npm run dev` starts the server and restarts it on every save. It prints the address it
listens on (`Listening on http://localhost:23017`), which works in the API panel, in a new tab,
and in the terminal:

```console
$ curl -s "localhost:$PORT/v1/events?q=jazz" | jq '.data[].title'
"The Blue Note Jam"
"Sunday Jazz Brunch"
"Late Night Jazz Session"
```

`requests.http` has a request for every endpoint, in an order that works top to bottom on fresh
data. The public pages are at `/` and `/e/<slug>` (open them in the Preview), the OpenAPI document
at `/openapi.json`, and a poster upload form at `/static/upload-test.html`.

Every demo account's password is `stagepass-demo-2026`:

| User | Email | Role | Owns |
| --- | --- | --- | --- |
| 1 Ada Admin | `admin@stagepass.test` | admin | everything, as support |
| 2 Olu Ade | `olu@stagepass.test` | organizer | events 1 to 14 |
| 3 Priya Nair | `priya@stagepass.test` | organizer | events 15 to 24 |
| 4 Cam Lee | `cam@stagepass.test` | customer | 16 orders, 4 favorites |
| 5 Dee Romero | `dee@stagepass.test` | customer | 14 orders |
| 6 Old Timer | `legacy@stagepass.test` | customer | a bcrypt hash from an older system, upgraded at first login |

The workspace freezes the clock at 2026-10-01T09:00:00Z (`HU_FIXED_TIME`), so events before
that date are over, and new orders and tokens look the same on every run.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | The server with `node --watch`: it restarts when a file changes |
| `npm start` | The server, once |
| `npm test` | Every test: unit, then API, then integration (`test:unit`, `test:api`, and `test:int` run one project) |
| `npm run typecheck` | `tsc --noEmit`, the same errors as the Problems panel |
| `npm run ci` | typecheck, test, and `db:check`, what CI runs before a merge |
| `npm run db:generate` | `drizzle-kit generate`: writes a migration from your changes to `src/db/schema.ts` |
| `npm run db:migrate` | `drizzle-kit migrate`: applies the migrations the database has not seen |
| `npm run db:check` | `drizzle-kit check`: the migration history is consistent |
| `npm run db:seed` | replaces every row with the demo data in `scripts/seed-data.ts` |
| `npm run db:reset` | drops everything, migrates from zero, and seeds (Reset database in the IDE is faster) |
| `npm run openapi` | writes `openapi.json` |
| `npm run race -- --ticket-type 21 --n 10` | fires concurrent checkouts at the running server and prints sold versus capacity |
| `npm run bench` | autocannon against `GET /v1/events` on the running server |

## How the code is laid out

```text
src/server.ts        the composition root: reads config, builds the pool, repositories, services, and
                     hooks, calls createApp(deps), listens, and shuts down gracefully
src/app.ts           createApp(deps): the middleware chain in order, the routers, 404, error handler
src/services.ts      wires repositories into services and registers the hooks (tests pass fakes)
src/config.ts        every environment variable, checked by zod at startup
src/logger.ts        pino, with secrets redacted
src/clock.ts         now(), frozen by HU_FIXED_TIME
src/cache.ts         TtlCache, the in-process cache in front of venue reads
src/db/              schema.ts (every table), client.ts (pool, Drizzle, query counter), tx.ts (withTx)
src/http/            what every feature shares: errors, error handler, validate, auth, rate limits,
                     security headers, pagination, idempotency, OpenAPI, request ids, caching headers
src/hooks/           registry.ts, the pre and post database hooks
src/modules/<feature>/
  <feature>.routes.ts       path, middleware, controller method, and the route's OpenAPI entry
  <feature>.controller.ts   HTTP in and out: validated input, one service call, status, view
  <feature>.service.ts      the rules, transactions, and hooks. Never sees req or res
  <feature>.repository.ts   every query, behind an interface
  <feature>.schemas.ts      zod: what requests may contain, and what responses look like
  <feature>.view.ts         the JSON clients get
  <feature>.policy.ts       who may see and change what
views/               EJS templates for the public pages
public/              CSS, images, and the upload page, served at /static
uploads/posters/     uploaded posters, served at /uploads/posters (never from public/)
drizzle/             SQL migrations and drizzle-kit's snapshots
scripts/             seed, reset, migrate, OpenAPI, race, bench
test/                unit/, api/, int/, and support/ (fakes, factories, tokens, the test database)
```

**MVC for an API.** The *model* is a feature's tables in `src/db/schema.ts` plus its domain types
and rules (`*.repository.ts` types, `*.service.ts`, `*.policy.ts`, `*.hooks.ts`). The *view* is
`*.view.ts`, the JSON shape clients see, and for the HTML pages `views/*.ejs`. The *controller*
is `*.controller.ts`. Services sit between controllers and repositories.

**Direction.** routes, then controllers, then services, then repositories, never backwards.
Services know nothing about HTTP: they throw `AppError` classes (`src/http/errors.ts`), and the
error handler alone turns them into responses. Every class receives what it needs in its
constructor, and `server.ts` is the only place that builds the real ones, so tests build the
same app from in-memory fakes (`test/support/fakes.ts`).

**Copy venues.** `src/modules/venues/` is the smallest complete feature. A new feature starts as
a copy of it. `favorites/` shows that a three-line feature may skip the controller.

## One request through every layer: `POST /v1/orders`

Cam buys two General tickets for Last Call Quartet:

```http
POST /v1/orders
Authorization: Bearer <Cam's access token>
Idempotency-Key: rest-client-demo-0001
Content-Type: application/json

{ "items": [{ "ticketTypeId": 22, "quantity": 2 }] }
```

1. `src/app.ts`: `requestId()` gives the request an id, pino-http logs it, helmet adds security
   headers, `express.json({ limit: "100kb" })` parses the body, and the `/v1` CORS and rate
   limit middleware run. The request reaches the router mounted at `/v1/orders`.
2. `src/modules/orders/orders.routes.ts`: `auth.required` (`src/http/auth.ts`) verifies the JWT
   and sets `req.user`. `requireRole("customer")` lets only customers buy.
   `requireIdempotencyKey` (`src/http/idempotency.ts`) checks the header, and
   `validate({ body: Checkout })` (`src/http/validate.ts`) parses the body with the zod schema
   in `orders.schemas.ts`: 1 to 4 items, 1 to 10 of each, no type twice.
3. `orders.controller.ts`, `checkout`: calls the service with the user, the parsed body, and the key.
4. `checkout.service.ts`, `CheckoutService.checkout`:
   - an order that already has this key is returned as it is (a retry), without selling again;
   - otherwise `withTx` (`src/db/tx.ts`) opens a transaction, retried on a deadlock;
   - `ticketTypesRepository.listForSale` loads the types with their event, which must be
     published and not started yet;
   - for each item in ticket type id order, `ticketTypesRepository.reserve` runs one atomic
     `UPDATE ticket_types SET sold = sold + $1 WHERE id = $2 AND sold + $1 <= capacity`. No row
     means sold out: `SoldOutError`, and the whole transaction rolls back;
   - `ordersRepository.create` inserts the order and its items;
   - `hooks.run("order.paid", ...)` runs the after-write hooks with the same transaction, and
     the audit hook (`src/modules/audit/audit.service.ts`) writes an `audit_log` row;
   - COMMIT. A simultaneous request with the same key loses on the unique constraint
     `orders_customer_id_idempotency_key_unique` and returns the winner's order.
5. Back in the controller: `toOrderJson` (`orders.view.ts`) shapes the answer, and it is sent as
   `201 Created` with `Location: /v1/orders/31`.
6. Anything thrown on the way (`SoldOutError`, a `ValidationError`, a database error) reaches
   `src/http/error-handler.ts`, which answers an RFC 9457 problem such as
   `{"type": "https://stagepass.test/problems/sold-out", "title": "Conflict", "status": 409, ...}`.

## Endpoints

| Method and path | Who | What |
| --- | --- | --- |
| `GET /healthz`, `GET /readyz` | anyone | liveness, and readiness (the database answers, not shutting down) |
| `POST /v1/auth/signup` | anyone | a customer account, logged in |
| `POST /v1/auth/login` | anyone | `{ accessToken, refreshToken, user, ... }`. 5 tries per 15 minutes per address and email |
| `POST /v1/auth/refresh` | anyone with a refresh token | a new pair. The old token is revoked, and reusing it revokes the whole login |
| `POST /v1/auth/logout` | anyone with a refresh token | ends that login |
| `GET /v1/me` | logged in | you |
| `GET /v1/venues`, `GET /v1/venues/:venueId` | anyone | venues |
| `POST /v1/venues`, `PATCH /v1/venues/:venueId` | admin | add and change venues |
| `GET /v1/events` | anyone | published events: `city`, `category` (repeatable), `from`, `to`, `q` (full text), `sort` (`startsAt`, `-startsAt`, `title`, `-title`), `cursor`, `limit` (1 to 50) |
| `POST /v1/events` | organizer, admin | a draft. The slug comes from the title |
| `GET /v1/events/:eventId` | anyone, drafts only their organizer and admins | one event |
| `PATCH /v1/events/:eventId` | its organizer, admin | change it (a published event keeps its slug) |
| `DELETE /v1/events/:eventId` | its organizer, admin | delete a draft |
| `POST /v1/events/:eventId/publish` | its organizer, admin | put a draft on sale (it needs a ticket type and a future start) |
| `POST /v1/events/:eventId/cancel` | its organizer, admin | cancel it, its paid orders, and notify the buyers |
| `PUT /v1/events/:eventId/poster` | its organizer, admin | `multipart/form-data` field `poster`: PNG, JPEG, or WebP, at most 2 MB |
| `GET /v1/events/:eventId/calendar.ics` | anyone | an iCalendar file, with an ETag |
| `GET /v1/events/:eventId/ticket-types` | as the event | its ticket types, cheapest first |
| `POST /v1/events/:eventId/ticket-types` | its organizer, admin | add one. All types together never exceed the venue's capacity |
| `POST /v1/orders` | customer | checkout, with an `Idempotency-Key` header |
| `GET /v1/orders` | logged in | your orders, newest first, by cursor (`limit` 1 to 50, default 10) |
| `GET /v1/orders/:orderId` | its customer, admin | one order (someone else's is a 404) |
| `POST /v1/orders/:orderId/cancel` | its customer, admin | cancel before the event starts, and the seats go back on sale |
| `GET /v1/me/favorites`, `PUT` and `DELETE /v1/me/favorites/:eventId` | logged in | favorite events |
| `GET /v1/organizer/events`, `GET /v1/organizer/stats` | organizer | your events with tickets sold and revenue, and sold-out ticket types |
| `GET /`, `GET /e/:slug` | anyone | the public HTML pages |
| `GET /openapi.json` | anyone | OpenAPI 3.1, generated from the zod schemas |

Errors are always `application/problem+json`: `type`, `title`, `status`, `detail`, `instance`,
and `errors: [{ field, message }]` when fields are to blame. Invalid input is 400, a missing or
bad token 401, a role or owner that may not 403, something hidden or missing 404, a clash with the
current state 409 (sold out, already cancelled), and a well-formed request about something that
cannot be used 422.

## Data

`src/db/schema.ts` describes every table, and `drizzle/` holds the migrations that build them:

| Migration | What it does |
| --- | --- |
| `0000_users_tokens` | `users` (unique `lower(email)`, role CHECK) and `refresh_tokens` (hashed, with a family) |
| `0001_venues_events` | `venues` and `events` (status and category CHECKs, ends after starts) |
| `0002_ticket_types` | `ticket_types`: `CHECK (sold <= capacity)`, the last line of defense against overselling |
| `0003_orders` | `orders` (unique customer and idempotency key) and `order_items` (1 to 10 each) |
| `0004_audit_notifications` | `audit_log` and `notifications` |
| `0005_event_search` | a generated `tsvector` column and its GIN index, for full text search |
| `0006_favorites` | `favorites`, keyed by user and event |
| `0007_event_slugs` | slugs added in three steps to a table with rows: expand, backfill, contract |
| `0008_lowercase_emails` | a custom migration: a trigger that lowercases emails, a database-level pre-write hook |
| `0009_orders_customer_idx` | the index "my orders, newest first" reads in order |

The demo data (`scripts/seed-data.ts`) has 4 venues, 24 events (16 published, 5 drafts, and 3
cancelled), 42 ticket types, and 30 orders. Events 8 to 11 start at the same moment, which every
cursor must handle. Event 1's VIP tickets are sold out, and event 7's Front Row (ticket type 21)
has one seat left. `sold` is worked out from the paid orders, so the two always agree.
`scripts/seed-perf.sql` adds 20,000 events and 60,000 orders for the performance lessons.

## Hooks before and after the database

Drizzle has no model hooks, so services announce their writes through `src/hooks/registry.ts`,
inside their transaction:

| Hook | Registered by | Does |
| --- | --- | --- |
| `event.beforeCreate` | `events.hooks.ts` | trims the title and sets a unique slug (`open-mic-night`, then `-2`) |
| `event.beforeUpdate` | `events.hooks.ts` | a draft's slug follows its title, a published event's never changes |
| `event.published`, `event.cancelled` | `audit.service.ts` | an `audit_log` row with who and what |
| `order.paid`, `order.cancelled` | `audit.service.ts` | the same, for orders |

Hooks get the service's transaction, so their writes commit or roll back with the change. The
database has its own pre-write hook too: the trigger from migration 0008.

## Security checklist (OWASP API Security Top 10, 2023)

| Risk | Where StagePass handles it |
| --- | --- |
| API1 Broken object level authorization | Orders are looked up by customer in SQL (`findForCustomer`), events through `events.policy.ts`, and what you may not see is a 404 |
| API2 Broken authentication | argon2id, one message and the same work for unknown emails (`DUMMY_HASH`), rate-limited login, 15 minute JWTs verified with a pinned algorithm, issuer, and audience, hashed rotating refresh tokens with reuse detection |
| API3 Broken object property level authorization | Bodies are `z.strictObject` (unknown keys are refused, no mass assignment), and views list every field they send (never a password hash) |
| API4 Unrestricted resource consumption | 100 kB bodies, 2 MB posters, at most 50 per page, a 100 character search, rate limits, `statement_timeout`, server timeouts |
| API5 Broken function level authorization | `requireRole` on every admin and organizer route |
| API6 Unrestricted access to sensitive business flows | At most 4 items and 10 of each per order, idempotency keys, atomic seat reservation |
| API7 Server side request forgery | The API never fetches a URL a client sends |
| API8 Security misconfiguration | helmet (CSP, nosniff, and more), an exact CORS allow-list, no `X-Powered-By`, an explicit `trust proxy`, config checked at startup, errors that never leak internals |
| API9 Improper inventory management | Versioned paths (`/v1`) and an OpenAPI document generated from the code itself |
| API10 Unsafe consumption of APIs | Uploads are untrusted: type from magic bytes, generated names, stored outside `public/`, served with `nosniff` |

## Tests

| Project | Where | Needs | Covers |
| --- | --- | --- | --- |
| unit | `test/unit/` | nothing | checkout rules, policies, hooks, cursors, tokens, passwords, the cache |
| api | `test/api/` | nothing | the whole app through supertest on in-memory fakes: status codes, headers, the authorization matrix |
| int | `test/int/` | `TEST_DATABASE_URL` | real SQL: concurrent checkouts that never oversell, full text search, keyset pages, migrations and constraints |

Tests run at the frozen moment 2026-10-01T09:00Z (`test/support/setup.ts`), and a test that needs
another time calls `vi.setSystemTime()`. `TEST_DATABASE_URL` is emptied and refilled by the int
tests, so it must never be your development database.

## In production

`Dockerfile` builds a two-stage image that runs `node src/server.ts` as the `node` user,
`compose.yaml` runs it with PostgreSQL, and `.github/workflows/ci.yml` runs `npm run ci` on every
push. Migrations are a release step (`node scripts/migrate.ts`) that runs before the new version
starts. On `SIGTERM` the server answers `/readyz` with 503, waits `SHUTDOWN_DELAY_MS`, stops
accepting connections, lets requests in flight finish (up to `SHUTDOWN_TIMEOUT_MS`), closes the
pool, and exits 0. Every setting is in `.env.example`.
