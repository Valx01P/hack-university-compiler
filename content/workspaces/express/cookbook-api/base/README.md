# Cookbook API

A recipes and reviews API in the classic Express MVC shape most MERN codebases use: `models/`
(Mongoose schemas with validation, virtuals, indexes, and middleware hooks), `controllers/`,
`routes/`, with `views/` as JSON serializers and `services/` for rules that span models. The
database is MongoDB through Mongoose 9. Node 26 runs the TypeScript directly, so there is no
build step, and `tsc --noEmit` type-checks it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the server and restarts it on change (`node --watch`). Run starts this |
| `npm start` | Starts the server once |
| `npm run db:seed` | Loads the deterministic seed (fixed ids, one password hash, exact ratings) |
| `npm run db:indexes` | `syncIndexes()` for every model, printing what changed |
| `npm run db:reset` | Seed, then sync indexes |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | The Vitest suite (model and API tests) against `TEST_MONGODB_URI` |

The server prints the address it listens on (`Listening on http://localhost:23017`), which works
in the API panel, a new tab, and the terminal: `curl -s "localhost:$PORT/api/recipes" | jq`.
`requests.http` has one request for every endpoint.

## How the code is laid out

```text
src/server.ts            entry point: connect, build the app, listen on PORT, shut down on a signal
src/app.ts               composition root: request id, pino-http, json, session, routes, 404, errors
src/config.ts            the environment, checked by a zod schema
src/clock.ts, logger.ts  the frozen-able clock (HU_FIXED_TIME) and the pino logger
src/db/mongoose.ts       the connection, strictQuery and sanitizeFilter, command monitoring
src/db/command-counter.ts counts a request's database commands into the X-Db-Commands header
src/models/              Mongoose schemas: the Model, with validation, virtuals, indexes, and hooks
src/models/plugins/      soft delete (query + aggregate hooks) and the shared toJSON shape
src/schemas/             zod schemas for what clients send
src/services/            rules that span models or need the current user (recipes, reviews, account)
src/views/               JSON serializers (the "V" of MVC for an API)
src/controllers/         HTTP in, service call, status and view out
src/routes/              URL to handler, with validate() and requireUser
src/middleware/          request id, validate, require-user, not-found, error handler
scripts/                 the seed and the index sync
test/                    model tests and supertest API tests, one database per file
```

Imports go one way: `routes` to `controllers` to `services` to `models`, with `views` shaping
the output and `middleware` wrapping the request. Only `app.ts` wires them together.

## Which hooks run for which operation

The hooks are the point of this codebase. Mongoose middleware runs around database operations;
which operation triggers which hook is the thing to learn.

| Operation | Hooks that run |
| --- | --- |
| `user.save()` after setting password | `pre("save")` hashes the password, but only when it changed (`isModified`) |
| `Recipe.create()` / `recipe.save()` | `pre("validate")` sets a unique slug, then validation, then the write |
| `review.save()` / `Review.create()` | `post("save")` recomputes the recipe's `ratingAvg` and `ratingCount` |
| `Review.findOneAndDelete()` | `post("findOneAndDelete")` recomputes the recipe's rating; `deleteOne` on a query runs no document hook |
| `Recipe.find` / `findOne` / `findOneAndUpdate` / `countDocuments` | the soft-delete query hook adds `deletedAt: null`, hiding deleted recipes |
| `Recipe.aggregate()` | the soft-delete aggregate hook unshifts `$match: { deletedAt: null }` |

A rule that must hold for every write (the slug, the password hash) lives in a model hook. A
side effect with consequences (sending the "reset your password" link) lives in a controller or
service, where it is visible and testable: `forgot-password` writes to a `mail_outbox` collection
instead of a hook sending mail.

## One request through every layer

`POST /api/recipes` with a recipe body, logged in as Julia:

1. `middleware/request-id.ts` gives the request an id and echoes `X-Request-Id`.
2. `pino-http` logs the request; `express.json()` parses the body; the session middleware loads
   Julia's session (`userId`).
3. `routes/recipes.routes.ts` matches `POST /`, runs `requireUser` (loads the user onto
   `res.locals.user`) and `validate({ body: CreateRecipeBody })` (a bad field stops here with 400).
4. `controllers/recipes.controller.ts` calls `createRecipe(user._id, req.body)`.
5. `services/recipes.service.ts` creates the recipe; the model's `pre("validate")` hook derives
   a unique slug, then validation and the write run.
6. The controller serializes the saved recipe with `views/recipe.view.ts` and answers 201 with a
   `Location` header.

## Endpoints

Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
`GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`,
`PATCH /api/me`, `DELETE /api/me`.
Recipes: `GET /api/recipes` (`cuisine`, `difficulty`, `tag`, `maxMinutes`, `q`, `sort`, `page`,
`limit`), `POST /api/recipes/search`, `GET /api/recipes/:slug`, `POST /api/recipes`,
`PATCH /api/recipes/:slug`, `DELETE /api/recipes/:slug` (soft).
Reviews: `GET /api/recipes/:slug/reviews`, `POST /api/recipes/:slug/reviews`,
`DELETE /api/reviews/:id`.
Collections: `GET /api/collections`, `POST /api/collections`, `GET /api/collections/:id`
(populated), `PUT /api/collections/:id/recipes/:slug`.
Stats: `GET /api/stats/cuisines`, `GET /api/stats/tags`. Health: `GET /health`, `GET /ready`.

Errors are `application/problem+json`: `{ type, title, status, detail, code, fields? }`. A
validation failure is 400 with a `fields` map, a duplicate key is 409, an unknown id or slug is
404, a permission failure is 403, and a missing session is 401.

## Data

`scripts/seed.ts` loads 4 users, 18 live recipes (3 per cuisine) plus 2 soft-deleted ones, 40
reviews, and 3 collections, all with fixed ObjectIds (`66f1…`). Every password is
`cook-with-node-26`. Julia Moreno (`julia@cookbook.test`, admin) has a pending password reset
whose token is `julia-reset-token-2026` (its SHA-256 and expiry are seeded). The clock is fixed
at `2026-10-01T09:00:00Z`, so timestamps are predictable. The database is a MongoDB one-node
replica set, which the account-deletion transaction needs.
