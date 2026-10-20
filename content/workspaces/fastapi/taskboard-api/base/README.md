# Taskboard API

A project management API: projects with members, tasks that move from to do to doing to
done, comments, and watchers. It is written in the layered style real FastAPI teams use,
with SQLAlchemy 2 on PostgreSQL 18, Alembic migrations, JWT logins, and a test suite that
runs every test in its own rolled-back transaction.

It serves the **Taskboard contract 1.0.0**, the API the Go course's backend also serves
and the React course's client calls, so a client built for one runs against the other.
Everything the contract defines is under `/v1`, plus `/healthz` and `/readyz`. This course
adds a few extensions on top, which the contract allows.

## Commands

| Command | What it does |
| --- | --- |
| `uv run fastapi dev --host 0.0.0.0 --port $PORT` | Starts the server and reloads it when a `.py` file changes. Run starts this |
| `uv run pytest` | Every test (`-k comments` runs some, `-x` stops at the first failure) |
| `uv run alembic upgrade head` | Brings the database to the newest migration |
| `uv run alembic check` | Fails if the models and the migrations disagree |
| `uv run python -m scripts.seed` | Empties the database and loads the seed again |
| `uv run python -m app.worker --once` | Sends what waits in the outbox, then exits |
| `uv run python -m http.server $WEB_PORT -d frontend` | Serves the board page in `frontend/` |
| `uv run ruff check` and `uv run ruff format` | Lint and format |

The server prints the address it listens on (`http://0.0.0.0:23017`), which works as
`localhost:23017` in the API panel, a new tab, and the terminal:
`curl -s localhost:$PORT/v1/projects/1 -H "Authorization: Bearer $TOKEN"`. The docs are at
`/docs` (Swagger UI, whose Authorize button logs in through `POST /v1/auth/token`) and
`/redoc`. `requests.http` has one request for each kind of call.

## Endpoints

The contract's routes. Every route but signup and login needs a token: send
`Authorization: Bearer <token>`, or the `tb_session` cookie that login sets.

| Method and path | What it does |
| --- | --- |
| `GET /healthz` | `{"status": "ok"}` while the process is up. Never touches the database |
| `GET /readyz` | `{"status": "ready", "checks": {"db": "ok"}}`, or 503 when the database does not answer |
| `POST /v1/auth/signup` | `{email, name, password}` creates a member. 409 for a taken email |
| `POST /v1/auth/login` | `{email, password}` returns `{token, expires_at, user}` and sets the `tb_session` cookie |
| `POST /v1/auth/logout` | Revokes the token and clears the cookie (204) |
| `GET /v1/me` | The current user |
| `GET /v1/users?q=` | Users whose name or email contains `q`, by name, at most 20 |
| `GET /v1/projects` | Your projects, by id, with your role and their `task_counts` |
| `POST /v1/projects` | Creates a project you own. Names are unique per owner in any letter case |
| `GET /v1/projects/{project_id}` | One project with its members |
| `PATCH /v1/projects/{project_id}` | Renames or restyles it (owners) |
| `POST /v1/projects/{project_id}/members` | `{user_id, role}` adds a member (owners) |
| `GET /v1/projects/{project_id}/stats` | `{"todo": n, "doing": n, "done": n}` |
| `GET /v1/projects/{project_id}/tasks` | `?status&assignee_id&q&sort&order&limit&offset`, as `{items, total, limit, offset}` |
| `POST /v1/projects/{project_id}/tasks` | Creates a task: `todo`, version 1, priority 2 unless given |
| `GET /v1/tasks/{task_id}` | One task, with `ETag: "v<version>"` |
| `PATCH /v1/tasks/{task_id}` | Changes the fields sent. Needs `If-Match` (428 without it, 412 when stale) |
| `DELETE /v1/tasks/{task_id}` | Deletes it with its comments and watchers (owners) |
| `POST /v1/tasks/{task_id}/transition` | `{to}` changes the status: todo to doing or done, doing to todo or done, done to doing |
| `GET /v1/tasks/{task_id}/comments` | `?limit&cursor`, oldest first, as `{items, next_cursor}` |
| `POST /v1/tasks/{task_id}/comments` | `{body}` adds a comment |
| `DELETE /v1/comments/{comment_id}` | The author or a project owner deletes it |
| `GET /v1/tasks/{task_id}/watchers` | Who watches the task, by user id |
| `PUT`, `DELETE /v1/tasks/{task_id}/watchers/{user_id}` | Watch and unwatch. Both are idempotent (204) |

This course's extensions:

| Method and path | What it does |
| --- | --- |
| `POST /v1/auth/token` | The OAuth2 password flow as a form (`username`, `password`), for Swagger's Authorize button |
| `PATCH /v1/me` | `{name}` changes your name |
| `GET /v1/me/tasks` | The tasks assigned to you, soonest due first, paged |
| `GET /v1/projects/{project_id}/board` | A column per status, each card with its assignee, tags, and comment count |
| `POST /v1/tasks/{task_id}/move` | `{status?, position}` drags a card within its column or to another one |
| `PATCH /v1/comments/{comment_id}` | `{body}` edits a comment (its author only) |
| `POST /internal/outbox/run` | Sends the outbox now. Needs `X-Internal-Key` |

Projects also carry `slug`, `start_date`, and `archived` (PATCH `{"archived": true}`), tasks
carry `position`, `GET /v1/tasks/{task_id}` lists the task's `tags`, and a project role
may be `viewer`.

## Who may do what

Visibility first: a project and everything in it is visible to its members, and an admin
(Ada) may read any project. Something you cannot see is a 404, so nobody learns it exists.
Something you can see but may not change is a 403.

| Action | Owner | Member | Viewer | Admin, not a member | Anyone else |
| --- | --- | --- | --- | --- | --- |
| Read the project, its tasks, comments, watchers | yes | yes | yes | yes | 404 |
| Create, edit, transition, move tasks | yes | yes | 403 | 403 | 404 |
| Comment, watch, unwatch | yes | yes | 403 | 403 | 404 |
| Edit a comment | its author | its author | 403 | 403 | 404 |
| Delete a comment | any | its author | 403 | 403 | 404 |
| Rename the project, add members, delete tasks | yes | 403 | 403 | 403 | 404 |

Roles are compared by rank (`RoleRank`, an `IntEnum`: viewer 1, member 2, owner 3), never
as text, where "viewer" > "member".

## Errors

Every error is an RFC 9457 problem, `application/problem+json`:

```json
{"type": "about:blank", "title": "Unprocessable Content", "status": 422,
 "detail": "title must be at most 120 characters", "errors": {"title": "must be at most 120 characters"},
 "request_id": "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"}
```

- **400** for a malformed request: a bad path id or query parameter, a cursor the API never
  issued, a body that is not JSON, an unknown field, or a wrong JSON type (`"priority": "3"`).
- **422** for a well-formed request that breaks a rule: a missing field, a value out of
  range, a date that does not exist, a transition the rules forbid.
- **409** for a clash with existing data (a taken email or project name, a membership that
  exists).
- This app's own rules name themselves in `type`: `.../task_locked` (409, reassigning a
  done task), `.../project_archived` (409, a new task in an archived project), and
  `.../due_before_project_start` (422).

## How the code is laid out

MVC as an API uses it: the **Model** is `models/` plus `repositories/` (tables and the
queries on them), the **View** is `schemas/` (the JSON clients send and get back), the
**Controller** is `api/routes/` (parse the request, call a service, answer). `services/`
holds what belongs to none of them: the business rules and the transactions.

```text
app/main.py              create_app(): settings, logging, error handlers, routers, middleware
app/middleware.py        request ids, timing, and one JSON log line per request
app/worker.py            the outbox worker (python -m app.worker --once)
app/core/                config, the clock, security (Argon2, JWTs), errors, request context, JSON logs
app/db/                  the declarative base, the engine and session dependency, the hooks
app/models/              User, Project and Membership, Task, Comment, TaskWatcher, Tag, OutboxMessage, AuditLog
app/schemas/             Pydantic models for bodies, responses, filters, and pages
app/repositories/        every query, and nothing else
app/services/            the rules: auth, users, projects, tasks, comments, watchers, notifications
app/api/deps.py          CurrentUser, the role checks, and paging
app/api/routes/          one router per resource, mounted under /v1 (health and internal outside it)
migrations/              Alembic: env.py and 0001 to 0006
scripts/seed.py          loads scripts/seed.json (the contract's seed) and this course's extras
tests/                   conftest.py (the test database and fixtures), factories.py, one file per area
frontend/index.html      a small board page for trying CORS from another port
```

Imports go one way: routes use services, services use repositories, repositories use
models, and nothing imports a layer above it. Routes never touch SQLAlchemy, and
repositories never raise HTTP errors: services raise `AppError`s from `core/errors.py`, and
one handler turns them into problems.

## One request through every layer

`POST /v1/projects/1/tasks` with `{"title": "Write the launch email", "assignee_id": 2}`
and Ada's token:

1. `app/middleware.py` gives the request an id (sent back as `X-Request-ID`) and binds it
   to the request context. `CORSMiddleware`, outside it, has nothing to do for a request
   without an `Origin`.
2. The router in `app/api/routes/tasks.py` matches the route. Before the function runs,
   FastAPI solves its dependencies: `ProjectMember` (from `api/deps.py`) reads the token
   (`get_access_token`), loads Ada (`get_current_user`), loads project 1, and checks that
   her role ranks at least member (otherwise 404 or 403). Then it validates the body as a
   `TaskCreate` from `app/schemas/task.py`: an unknown field stops here with 400, a title
   of 121 characters with 422.
3. `create_task` in `app/services/tasks.py` applies the rules: the project is not
   archived, Grace is a member, the due date is not in the past or before the project
   starts. It asks `repositories/tasks.next_position` for the end of the To do column,
   which locks the column so two creates cannot take the same place.
4. `repositories/tasks.add` adds the `Task` and flushes. On the way, the `before_flush`
   hook in `app/db/events.py` stamps `created_at` and `updated_at` from the clock, and the
   INSERT gets an id and version 1.
5. `services/notifications.task_assigned` queues a mail to Grace on the session, and the
   service commits. Only then does the `after_commit` hook write the line to
   `var/mail.log`. A rollback would drop it.
6. The route answers 201 with `TaskOut` (from the ORM object, `from_attributes`), a
   `Location` header, and `ETag: "v1"`.

## Hooks before the database

- `Project` gets its slug in a `before_insert` mapper hook (`website`, `website-2`, ...),
  even when a script adds a project straight to the session. Renaming keeps the slug.
- `User.email` is trimmed and lowercased by `@validates`, however it is set.
- `before_flush` sets timestamps from the clock and writes an `AuditLog` row with
  `{"column": [old, new]}` for every changed or deleted task, with the actor and the
  request id from the request context, in the same transaction.
- `after_commit` writes queued mail. Status changes go through the outbox instead: rows in
  the same transaction, sent later by the worker with `FOR UPDATE SKIP LOCKED`.

## Data

`scripts/seed.json` is the contract's seed, byte for byte. Users: Ada Lovelace
(`ada@example.com`, admin), Grace Hopper, Linus Torvalds, and Margaret Hamilton (in no
project), all with the password `correct horse battery staple`. Projects: 1 Website
Relaunch (Ada owns it, Grace is a member), 2 Mobile App (Grace owns it, Linus and Ada are
members), and 3 Data Pipeline (Linus). 18 tasks (8, 7, and 3), 31 comments (23 on task 1,
where comments 10 and 11 share a time), and 6 watchers. The course's extras: slugs, start
dates (2026-09-01, 2026-09-01, 2026-09-15), task positions, the tags frontend, backend,
bug, design, urgent, and docs on 15 tasks, and 5 audit rows.

The clock is fixed at `HU_FIXED_TIME=2026-10-01T09:00:00Z`, so "today" is 2026-10-01: tasks
2, 5, and 11 are overdue, task 3 is due today, and new rows get that time.

## Tests

`tests/conftest.py` migrates the test database (`TEST_DATABASE_URL`, whose name must end in
`test`) once and empties it. Each test then runs in one transaction that rolls back at the
end, and app code that calls `session.commit()` only releases a savepoint inside it. The
fixtures: `db`, `client` (TestClient, built on httpx2), `auth_headers(user)`, `seeded` (the
contract's rows), `count_queries()` (to catch N+1 queries), and `mail_log`.
`tests/factories.py` builds rows with sensible defaults: `make_user`, `make_project`,
`make_task`, `make_comment`, `make_tag`.

## Settings

`.env` holds this workspace's settings and `.env.example` documents every key. Real
environment variables win over `.env`. `CORS_ORIGINS` lists the browser origins that may
call the API with credentials: the board page in `frontend/` (on `WEB_PORT`) is there
already, and the React course's client is added the same way.

`Dockerfile` builds the production image (two stages with uv, a non-root user,
`fastapi run`), and `compose.yaml` runs it with PostgreSQL and a migrate step. The
workspace cannot run Docker, so try them on your own machine.
