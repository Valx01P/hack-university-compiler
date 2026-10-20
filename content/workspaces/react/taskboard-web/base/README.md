# Taskboard web

The web client of **Taskboard**, a team task tracker: log in, see your projects, and manage
tasks on a board (To do, Doing, Done) or in a sortable list, with priorities, due dates,
assignees, comments, watchers, and labels. It is a React 19 single-page app written the way a
strong team writes one in 2026, and it comes with a local **mock API** of the Taskboard
contract, so it runs on its own and also against a Go or FastAPI `taskboard-api` you built.

| Piece | What it is |
| --- | --- |
| React 19.3, TypeScript 7 | Components in `.tsx`, checked by `tsc -b` |
| Vite 8 | The dev server (hot reloading) and the production build |
| React Compiler 1.0 | Memoizes components and hooks for you, so the code has no `useMemo` or `memo` |
| React Router 8 | Data mode: routes as objects, loaders, actions, fetchers, and middleware |
| TanStack Query 5 | The cache of server data: queries, mutations, optimistic updates |
| CSS Modules | One stylesheet per component, on the design tokens in `src/styles/tokens.css` |
| Vitest 5, Testing Library, MSW 3 | Component tests against a fake network |
| Playwright 1.64 | Two end-to-end journeys in a real browser |
| Express 5 | The mock API in `api/`, which Node runs as TypeScript directly |

## Run it

```sh
npm run dev
```

This starts the mock API and Vite together (`scripts/dev.ts`), with their output prefixed
`[api]` and `[web]`. Open the address Vite prints, which redirects to `/login`. In a workspace
the ports are leased for you (`WEB_PORT` for Vite, `API_PORT` for the API) and the Preview opens
by itself.

**Log in** as any of these. Every account's password is `correct horse battery staple`.

| User | Email | Account role | Projects |
| --- | --- | --- | --- |
| Ada Lovelace | ada@example.com | admin | owns Website Relaunch, member of Mobile App |
| Grace Hopper | grace@example.com | member | owns Mobile App, member of Website Relaunch |
| Linus Torvalds | linus@example.com | member | owns Data Pipeline, member of Mobile App |
| Margaret Hamilton | margaret@example.com | member | none (she sees the empty state) |

The mock compares passwords as plain text, which only a mock may do: a real API stores a slow
hash (bcrypt or Argon2) and compares hashes, as the Go, FastAPI, Express, and Spring courses
build. The clock is fixed at `2026-10-01T09:00:00Z` (`HU_FIXED_TIME`), so "today" is October 1:
tasks 2, 5, and 11 are overdue, task 3 is due today, and tasks 7, 9, 12, and 16 are due within a
week.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | The API and Vite together. Ctrl+C stops both |
| `npm run dev:web` | Vite alone, for another backend (see the end of this file) |
| `npm run dev:api` | The API alone, restarting when a file in `api/` changes |
| `npm run typecheck` | `tsc -b`: the app, the Node files, and the API, as three projects |
| `npm run lint` | oxlint with the hooks and React Compiler rules (`.oxlintrc.json`) |
| `npm test` | Vitest in watch mode: re-runs the tests a change affects |
| `npm run test:run` | Every test once, the way checks run them |
| `npm run build` | Type-checks, then builds `dist/` with hashed file names |
| `npm run preview` | Serves `dist/` on port 4173, with the same API proxy |
| `npm run e2e` | Builds, starts the API and `vite preview`, and runs `e2e/` in Chromium |
| `npm run api:reset` | Puts the API's data back to the seed (the IDE's **Reset data** does the same) |

The scripts start Vite and Vitest with `--configLoader native`: Node loads `vite.config.ts` as
TypeScript, the way it runs the API, instead of Vite bundling it into `node_modules`, which a
workspace shares read-only. Run them through `npm run` (or add the flag), and every cache they
keep lands in `.vite/`.

## The map

```text
src/
  main.tsx              the entry: providers around the router, inside <StrictMode>
  app/                  wiring: the routes, the router, the providers, the shell, error pages
  components/ui/        primitives every feature uses: Button, Field, Dialog, Menu, Tag, Avatar, ...
  components/layout/    the shell's parts: Sidebar, Header, SearchBox, ThemeToggle
  features/
    auth/               login, logout, the session, the middleware that guards routes
    projects/           the projects page, a project's layout and tabs, rename, stats, members
    tasks/              the board, the list, a task's page, editing, and every task mutation
    comments/           a task's comments: pages of 10, posting with useOptimistic
    users/              the Team page
    watchers/           who watches a task: a small, finished feature to copy
    labels/             label chips, the label picker, the label filter
    settings/           theme and density, and the admin-only danger zone (a lazy route)
  hooks/                hooks with no feature: localStorage, media queries, debouncing, theme
  lib/                  the API client, the clock, formatting, storage, the cache keys
  styles/               design tokens and the global reset
  test/                 the test setup, the fake API (MSW), its fixtures, and render helpers
api/                    the mock API (Express): server.ts, then routes/, auth, storage, views
e2e/                    Playwright specs
public/                 files served as they are: the favicon and the avatars
```

Rules the code follows:

- **A feature's public API is its `index.ts`.** Other code imports `@/features/tasks`, never a
  file under `features/tasks/components/` or `features/tasks/hooks/` (oxlint's
  `no-restricted-imports` enforces it). The exceptions are a feature's `api.ts` and
  `tasks/cache.ts`, which import only `lib/`, so another feature may import them without pulling
  in components (`ProjectCard` prefetches with `@/features/tasks/api`).
- **Server data lives in TanStack Query, not in state.** Each feature's `api.ts` describes its
  queries once (`taskQueries.list`, `projectQueries.detail`), with keys from `lib/query-keys.ts`.
- **The URL holds what a link should restore**: filters, sort, and page are search params
  (`useTaskFilters`), not state.
- **Every network call goes through `lib/api-client.ts`**, which turns error responses into an
  `ApiError` carrying the API's problem: `status`, `title`, and `fieldErrors` for forms.
- **Time comes from `lib/clock.ts`** (`now()`, `todayISO()`), never `new Date()`, so tests control it.
- **Styles are CSS Modules on tokens.** A component imports its own `.module.css`, and colors and
  sizes are variables from `tokens.css`, so the dark theme is a list of overrides.

## What happens when you drag a card to Done

1. **`TaskCard.tsx`** is `draggable`. `onDragStart` puts the task's id on the drag as
   `application/x-taskboard-task`.
2. **`BoardColumn.tsx`** for Done accepts the drop (`onDragOver` calls `preventDefault`), finds
   the task, checks `canTransition(task.status, "done")` from `types.ts`, and calls
   `transition.mutate({ task, to: "done" })`. The Status menu on the card calls the same mutation
   from the keyboard.
3. **`hooks/use-update-task.ts`**, `useTransitionTask`, runs `onMutate` first: `snapshotTask`
   (`cache.ts`) cancels in-flight refetches of the project's lists and remembers every cached copy
   of the task, then `writeTask` sets its status to done in all of them. The board re-renders, and
   the card is in Done before any request leaves.
4. **`api.ts`**, `transitionTask`, calls `apiFetch("/tasks/3/transition", { method: "POST", body: { to: "done" } })`.
5. **`lib/api-client.ts`** prefixes `/v1`, sends JSON with the session cookie, and returns the
   parsed task, or throws an `ApiError` built from the API's problem.
6. **Vite's proxy** (`vite.config.ts`) forwards `/v1/...` to the API on `API_PORT`.
7. **`api/server.ts`** logs the request, applies CORS and the teaching headers (`chaos.ts`), and
   parses the JSON body. **`auth.ts`**'s `requireUser` turns the `tb_session` cookie into the user.
8. **`api/routes/tasks.ts`**: `visibleTask` answers 404 for a task in a project you can't see,
   `requireRole` answers 403 if you can see but not change it, the transition rules answer 422
   (done may only go back to doing), then the task gets `status: "done"`, `completed_at` from the
   clock, and `version + 1`. **`db.ts`** writes `api/data/db.json`, and **`views.ts`** shapes the
   JSON with an `ETag: "v2"`.
9. **Back in the hook**: `onSuccess` writes the server's task into the cache (its new version
   included), or `onError` restores the snapshot and shows a toast. `onSettled` invalidates the
   project's lists, its stats, and the projects page, which refetch in the background, so every
   count ends up exactly as the server has it.

## The API

The mock serves the Taskboard contract (`content/contracts/taskboard/openapi.yaml` in the
course): it passes the contract's `acceptance.http` and `acceptance-labels.http`, and every
response it sends validates against `openapi.yaml`. `requests.http` sends one example of each
route. Errors are RFC 9457 problems: `{ type, title, status, detail, errors? }`, where `errors`
maps a field to its message (`{"title": "is required"}`). 400 means a malformed request, 422 a
well-formed one that breaks a rule, 404 something you can't see, and 403 something you can see
but may not change.

| Method and path | Does |
| --- | --- |
| `POST /v1/auth/signup` | `{ email, name, password }` (12 characters to 72 bytes): 201, 409 for a taken email, or 422 |
| `POST /v1/auth/login` | `{ email, password }`: `{ token, expires_at, user }` and the `tb_session` cookie (HttpOnly, SameSite=Lax), or 401 |
| `POST /v1/auth/logout` | 204, ends the session, and clears the cookie |
| `GET /v1/me` | The current user, or 401 |
| `GET /v1/users?q=` | Up to 20 users whose name or email contains `q` (everyone without it). Slow on purpose: 520 ms for one character, 80 ms less per extra character, at least 120 ms |
| `GET /v1/projects` | Your projects, each with your `role` and its `task_counts` |
| `POST /v1/projects` | `{ name, description, color }`: 201, 409 for a name you already use, or 422 |
| `GET /v1/projects/{project_id}` | The project with its members, or 404 |
| `PATCH /v1/projects/{project_id}` | Rename (owners): 200, 403, 409, or 422 |
| `POST /v1/projects/{project_id}/members` | `{ user_id, role }` (owners): 201, 403, 409, or 422 |
| `GET /v1/projects/{project_id}/stats` | `{ "todo": n, "doing": n, "done": n }` |
| `GET /v1/projects/{project_id}/tasks` | `?status=&assignee_id=&q=&label=&sort=&order=&limit=&offset=`: `{ items, total, limit, offset }`. `sort` is `due`, `priority`, `created`, or `title` |
| `POST /v1/projects/{project_id}/tasks` | `{ title, description, priority, due_on, assignee_id }`: 201, or 422 |
| `GET /v1/tasks/{task_id}` | The task, with `ETag: "v<version>"` |
| `PATCH /v1/tasks/{task_id}` | A partial edit with `If-Match: "v<version>"`: 200, 412 with the current task in `current`, or 428 without `If-Match` |
| `DELETE /v1/tasks/{task_id}` | 204 for the project's owner, 403 for other members |
| `POST /v1/tasks/{task_id}/transition` | `{ to }`: 200, or 422 for a move the rules forbid |
| `GET /v1/tasks/{task_id}/comments?limit=&cursor=` | `{ items, next_cursor }`, oldest first. The client asks for 10 at a time |
| `POST /v1/tasks/{task_id}/comments` | `{ body }`: 201, 422, or 500 when the body contains `#fail` (this mock's switch for rollback demos) |
| `DELETE /v1/comments/{comment_id}` | 204 for the author or a project owner, 403 for other members |
| `GET /v1/tasks/{task_id}/watchers` | Who watches the task |
| `PUT`, `DELETE /v1/tasks/{task_id}/watchers/{user_id}` | Watch, stop watching: 204 |
| `GET`, `POST /v1/projects/{project_id}/labels` | The project's labels with their task counts, and a new label |
| `PUT`, `DELETE /v1/tasks/{task_id}/labels/{label_id}` | Put a label on a task (5 at most), take it off: 204 |
| `GET /healthz`, `GET /readyz` | `{ "status": "ok" }`, `{ "status": "ready" }` |
| `GET /_hu/log`, `POST /_hu/reset`, `GET /_hu/state` | For Hack University's checks only: the request log, a reset to the seed, the stored rows |

**Teaching controls.** Any `/v1` request may carry `X-HU-Delay: <ms>` (or `?_delay=`) to answer
that much later, and `X-HU-Fail: <status>` (or `?_fail=`) to answer with that error; the Preview's
Network menu sets them. The API prints each request as `GET /v1/users?q=gr 200 442ms`.

**The data** lives in `api/data/db.json` (git-ignored), which every request reads and every change
rewrites, so a reset or a hand edit shows up at once. `api/seed.json` holds the contract's seed
rows (3 projects, 18 tasks, 31 comments, 6 watchers) plus 8 labels that only this mock has.

## Tests

`npm test` runs every `*.test.ts(x)` under `src/` in jsdom. `src/test/setup.ts` starts MSW with
the handlers in `src/test/handlers.ts`, an in-memory copy of the API built from `api/seed.json`,
and fails any request no handler expects and any test that logs a `console.error`.
`src/test/render.tsx` renders with everything the app has around it:

```tsx
// One component, at a URL, as a logged-in user.
const { user } = renderWithProviders(<UserDirectory />, { as: "grace" });

// The whole app at a URL, middleware and loaders included.
const { router } = renderApp("/projects/999");
expect(await screen.findByRole("heading", { name: "Project not found" })).toBeInTheDocument();

// One answer changed for one test.
server.use(http.get("/v1/users", () => HttpResponse.json([])));
```

`npm run e2e` runs the Playwright specs at 1280 and 375 pixels wide against the production
build and the real API. Each spec starts with `POST /_hu/reset`. Install the browser once with
`npx playwright install chromium` (the workspace image has it already).

## Resetting

- **Your files**: the IDE's Reset puts a file, a folder, or everything back as it was.
- **The data**: `npm run api:reset`, or **Reset data** in the IDE.
- **This browser's settings** (theme, density): Settings, or Clear site data in the Preview's menu.

## Running the client against your own taskboard-api

Every Taskboard backend in the course serves the same contract, so this client runs against the
Go or FastAPI `taskboard-api` you built:

1. Start your backend with this app's origin allowed: `CORS_ORIGINS=http://localhost:<the port
   Vite prints>` (FastAPI reads it from `.env`, Go from the environment). It prints its own
   address, such as `http://localhost:23017`.
2. Here, create `.env.local` with `VITE_API_BASE=http://localhost:23017/v1`.
3. Run `npm run dev:web` (Vite without the mock) and log in as usual.

`apiFetch` sees an absolute base and sends `credentials: "include"`, so the browser sends the
session cookie across ports: both origins are `localhost`, so the `SameSite=Lax` cookie counts
as same-site, and `CORS_ORIGINS` lets the page read the responses. A backend without the labels
tier answers 404 on the label routes, and the client then hides every label control.
