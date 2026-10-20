# Taskboard API

A team task tracker's JSON API, in the layered shape most Go services have: people sign
up and log in, create projects, add members, and move tasks across a board, with
comments, watchers, attachments, and background jobs. It runs on the standard library's
`net/http`, PostgreSQL 18 through pgx and sqlc, and goose migrations, and it serves the
**Taskboard contract**, the same API the FastAPI course builds and the React course's
client calls.

```sh
make run          # start it: it prints the URL it listens on
make test         # every test (the database tests use DATABASE_URL)
make              # every other command
```

The workspace has already migrated and seeded its database, and set `PORT`,
`ADMIN_PORT`, `DATABASE_URL`, and `HU_FIXED_TIME`. Open `requests.http` in the API panel
and send **Log in as Ada** first: the other requests reuse its token.

## How the code is laid out

MVC for an API: the **models** are the domain types, the **views** are the response
DTOs, and the **controllers** are the handlers. Two more layers sit below them: the
**services**, where the business rules live, and the **stores** (repositories), the
only code that knows SQL. Dependencies point one way, down this list, and each layer
talks to the one below through an interface the upper layer declares.

| Path | Layer | What it holds |
| --- | --- | --- |
| `cmd/api/main.go`, `run.go` | composition root | Reads the config, builds every layer, serves, and shuts down in reverse order |
| `internal/api/` | controllers and views | `routes.go` (every route in one place), one handler file per resource, `dto.go` (the JSON shapes), `problems.go` (every error as an RFC 9457 problem), `middleware.go` |
| `internal/service/` | business rules | One service per resource, `policy.go` (who may do what), `hooks.go` (rules around writes), `ports.go` (the interfaces the stores implement) |
| `internal/domain/` | models | Users, projects, tasks, comments, their rules (`CanTransition`, `Validate`, the `BeforeCreate` hooks), and the errors every layer shares |
| `internal/store/` | repositories | One repository per table, `mapError` (database errors to domain errors), `tx.go` (transactions with retries), `tracer.go` (slow query logs) |
| `internal/store/sqlcdb/` | generated | What `sqlc generate` writes from `db/queries` and `db/migrations`. Never edited by hand |
| `db/migrations/` | schema | Ten goose migrations, embedded in the binary by `db/migrations.go` |
| `db/queries/` | SQL | Every query, named for sqlc (`-- name: GetTask :one`) |
| `db/seed.sql`, `db/seed_perf.sql` | data | The contract's rows, and 5,000 tasks for performance work |
| `internal/auth/` | security | bcrypt, session tokens, JWTs, and the user in the request context |
| `internal/jobs/` | background work | The worker that claims jobs from the `jobs` table, and their handlers |
| `internal/config/`, `clock/`, `files/`, `metrics/` | support | Settings, the fixable clock, the upload folder (an `os.Root`), and expvar counters |
| `internal/service/servicetest/` | test support | An in-memory fake of every store, seeded with the contract's rows |
| `internal/testdb/` | test support | A fresh, migrated PostgreSQL schema per test, and factories |

## One request through every layer

`GET /v1/tasks/3` with Grace's token:

1. **Middleware** (`internal/api/server.go`, `middleware.go`). `requestID` names the
   request, `logRequests` will log it, CORS and CSRF checks pass, and the `ServeMux`
   matches the pattern `GET /v1/tasks/{taskID}` from `routes.go`. That route is
   `private`, so `requireAuth` reads the bearer token (or the `tb_session` cookie),
   finds the session through `AuthService.Authenticate`, and puts Grace in the context.
2. **Controller** (`internal/api/tasks.go`, `getTask`). It reads `{taskID}` with
   `pathID` (not a number would be a 400) and calls `TaskService.Get`.
3. **Service** (`internal/service/tasks.go`, `Get` and `load`). It loads the task, asks
   `ProjectStore.MemberRole` what Grace may do in project 1, and applies `canView` from
   `policy.go`. A task Grace may not see would come back as not found, exactly like a
   task that does not exist.
4. **Store** (`internal/store/tasks.go`, `TaskRepo.Get`). It runs the generated
   `sqlcdb.GetTask`, the query in `db/queries/tasks.sql`, and turns the row into a
   `domain.Task` with `toDomainTask`. With no row, `mapError` turns `pgx.ErrNoRows`
   into `domain.ErrNotFound`, wrapped as "task 3 not found".
5. **Back up.** The handler sets `ETag: "v1"` from the task's version and writes the
   view, `toTaskResponse` in `dto.go`. An error at any step goes to `writeProblem`,
   where `statusFor` picks the status with `errors.Is` and `errors.AsType`, so a
   wrapped `ErrNotFound` from the store is still a 404.

## Endpoints

Every `/v1` route needs `Authorization: Bearer <token>` (or the `tb_session` cookie)
except signup and login. Errors are `application/problem+json` with an `errors` member
naming each field to blame.

| Method and path | Who | What |
| --- | --- | --- |
| `GET /healthz`, `GET /readyz` | anyone | The process is up; the database answers within 1 s |
| `POST /v1/auth/signup` | anyone | An account: email, name, a password of 12 characters to 72 bytes |
| `POST /v1/auth/login` | anyone | `{token, expires_at, user}` and the `tb_session` cookie. 5 attempts a minute |
| `POST /v1/auth/logout` | you | Ends the session and clears the cookie |
| `GET /v1/me` | you | Who you are |
| `GET /v1/users?q=` | you | People by name or email, 20 at most |
| `GET`, `POST /v1/projects` | you | Your projects with task counts; create one (you own it) |
| `GET`, `PATCH /v1/projects/{projectID}` | members, admins read; owners change | A project with its members; rename or restyle it |
| `POST /v1/projects/{projectID}/members` | owners | Add someone as `member` or `owner` |
| `GET /v1/projects/{projectID}/stats` | members, admins | Task counts by status |
| `GET /v1/projects/{projectID}/tasks` | members, admins | One page: `status`, `assignee_id` (or `none`), `q`, `sort` (`due`, `priority`, `created`, `title`), `order`, `limit` (1 to 100), `offset`, `include=assignee,watchers` |
| `POST /v1/projects/{projectID}/tasks` | members | Create a task (todo, version 1) |
| `GET`, `PATCH`, `DELETE /v1/tasks/{taskID}` | members edit with `If-Match`; owners delete | A task with its `ETag`; edit it (412 when stale, 428 without `If-Match`); delete it |
| `POST /v1/tasks/{taskID}/transition` | members | `{"to": "doing"}`: todo to doing or done, doing to todo or done, done back to doing |
| `GET`, `POST /v1/tasks/{taskID}/comments` | members, admins read; members write | Comments oldest first, paged with `limit` and `cursor`; add one |
| `DELETE /v1/comments/{commentID}` | the author, owners | Delete a comment |
| `GET /v1/tasks/{taskID}/watchers` | members, admins | Who watches a task |
| `PUT`, `DELETE /v1/tasks/{taskID}/watchers/{userID}` | members | Watch or stop watching (repeating changes nothing) |
| `POST /v1/tasks/{taskID}/attachments` | members | Upload a PNG, JPEG, or PDF of up to 2 MB, as `multipart/form-data` field `file` |
| `GET /v1/attachments/{attachmentID}` | members, admins | Download it (ranges work) |

The admin server, on `ADMIN_PORT` and `127.0.0.1` only, serves `GET /debug/vars`
(request counts by route and status, latency buckets, requests in flight) and
`/debug/pprof/`.

## The seed

Everyone's password is `correct horse battery staple`.

| User | Account | Projects |
| --- | --- | --- |
| 1 Ada Lovelace, `ada@example.com` | admin: reads every project | owns 1 Website Relaunch, member of 2 |
| 2 Grace Hopper, `grace@example.com` | member | owns 2 Mobile App, member of 1 |
| 3 Linus Torvalds, `linus@example.com` | member | owns 3 Data Pipeline, member of 2 |
| 4 Margaret Hamilton, `margaret@example.com` | member | none: the outsider |

18 tasks (1 to 8 in project 1, 9 to 15 in project 2, 16 to 18 in project 3), 31
comments (23 on task 1, three pages of 10), and 6 watcher rows. With the clock at
2026-10-01, tasks 2, 5, and 11 are overdue and task 3 is due today.

## Settings

The server reads these from the environment once, at startup, in `internal/config`.
Flags win over the environment: `-port`, `-admin-port`, `-log-level`, and `-version`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8080 | The API's port (the workspace sets one that is free) |
| `ADMIN_PORT` | 6060 | Metrics and pprof on 127.0.0.1; 0 turns them off |
| `DATABASE_URL` | required | `postgres://user:password@host:5432/db` |
| `APP_ENV` | development | `development` adds `X-Query-Count`; `production` demands a real secret |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, or `error`. Logs are JSON lines on stdout |
| `TOKEN_SECRET` | made up in development | Signs JWTs. Production needs 32 bytes or more |
| `AUTH_MODE` | session | `session` (opaque tokens in the sessions table) or `jwt` |
| `BCRYPT_COST` | 10 | How slow password hashing is |
| `MIGRATE_ON_START` | false | Apply pending migrations before serving |
| `SLOW_QUERY_MS` | 200 | Log queries slower than this; 0 logs none |
| `CORS_ORIGINS` | none | Browser origins that may call the API with cookies, comma-separated |
| `TRUSTED_PROXY` | none | The proxy whose `X-Forwarded-For` the login limit believes |
| `UPLOAD_DIR` | data/uploads | Where attachments are stored |
| `SHUTDOWN_TIMEOUT` | 10s | How long in-flight requests get after Ctrl+C or SIGTERM |
| `HU_FIXED_TIME` | none | Stops the clock at an RFC 3339 time, so responses never change |

## Database work

```sh
make migrate-status               # which migrations are applied
goose create add_labels sql       # a new migration in db/migrations
make migrate-up                   # apply it
make sqlc                         # regenerate internal/store/sqlcdb after changing SQL
make db-reset                     # goose reset, goose up, then psql -f db/seed.sql
psql "$DATABASE_URL"              # look around: \dt, \d tasks
```

The IDE's **Reset database** puts the seeded database back in under a second.

## Tests

| Command | What runs |
| --- | --- |
| `make test-short` | Unit and handler tests over in-memory fakes, no database needed |
| `make test` | Those, plus repository, contract, and end-to-end tests on PostgreSQL, each in its own schema |
| `make test-race` | Everything with the race detector |
| `go test ./internal/api -run Golden -update` | Rewrite the golden files in `internal/api/testdata` |
| `go test ./internal/api -bench EncodeCursor -benchmem` | The cursor encoder's speed and allocations |

## What is installed

Go 1.27.2 (`gofmt`, `go vet`, the race detector), sqlc 1.31.1, goose 3.29.0,
golangci-lint, `psql`, `curl`, `jq`, and `make`. The workspace has no internet, but every
module this project uses is in the local module cache, so builds and `go get` of those
versions work offline.
