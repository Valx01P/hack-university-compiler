# hu-runner

The workspace runner: the one local service that talks to Docker. It runs
learner code in hardened, throwaway containers (jobs), and keeps the IDE's
workspaces: their files, containers, terminals, tasks, port bridges, and
checks. It is TypeScript run directly by Node's type stripping (Node 24.12 or
newer), with no build step, and listens on `127.0.0.1:3100`.

```
browser ──▶ Next.js /api/* ──(bearer token)──▶ hu-runner 127.0.0.1:3100 ──(Docker API)──▶ hu-job-<uuid>, hu-ws-<id>
browser ──(ws://127.0.0.1:3100, ticket first)──▶ hu-runner (file events, terminals, check progress)
browser ──(http://localhost:23000-29999)──▶ hu-runner port bridge ──(docker exec socat)──▶ a server in hu-ws-<id>
```

- `npm run up` starts it beside the app and restarts it if it crashes.
  `npm run dev` runs it under `node --watch` beside `next dev`.
  `npm run runner` runs it alone, for verifiers and debugging.
- Its own dependencies live in `runner/package.json` (dockerode 5.0.1, ws
  8.22.0, zod 4.6.7, pinned exactly), installed with `--ignore-scripts` so no
  native code is built. `npm run up` installs them.
- It starts with Docker off: `/v1/health` says `"down"`, a run answers 503
  `docker_unavailable` ("Start Docker to run this."), and it picks Docker up
  within 5 seconds of it starting.
- It takes its port before it touches Docker, so a second runner started on a
  port that's taken (`npm run runner` beside `npm run up`) exits at once and
  leaves the first one's jobs alone. A request that arrives while it first
  looks at Docker waits for that look (a moment), so the first `/v1/health`
  is already right.

Design: `architecture.md` §2.6, §3.2, §3.3, §3.5, §4.1, §4.2, §4.3, §4.7,
§6.7, §7.2, §7.3, §11 in the expansion plan. This file is the contract the app
codes against.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `HU_RUNNER_PORT` | `3100` | Port, on `127.0.0.1` only |
| `HU_RUNNER_TOKEN` | the token file | The bearer token. `npm run up` writes a fresh one to `~/.hack-university/runner-token` (0600) every run and passes it to both the runner and Next.js |
| `PORT` | `3000` | The app's port. WebSockets accept only the Origins `http://localhost:<PORT>` and `http://127.0.0.1:<PORT>` |
| `HU_DATA_DIR` | `~/.hack-university` | Token, logs (`logs/runner.log`, rolled at 10 MB), and later workspaces |
| `HU_NS` | `live` | `verify` for the verifiers: `hv-` names and `hu.ns=verify` labels, so they never touch a learner's objects |
| `HU_JOB_SLOTS` | `4` | Jobs at once. The rest wait in a FIFO queue |
| `DOCKER_HOST`, `DOCKER_CONTEXT` | the active context | Which Docker, found the way the docker CLI finds it (Docker Desktop, Colima, OrbStack) |
| `HU_TICKET_TTL_MS`, `HU_WS_HELLO_MS`, `HU_POLL_MS` | 30000, 5000, 5000 | Ticket lifetime, the time a socket has to send its ticket, and how often Docker is checked and leftovers reaped. Tests shorten them |
| `HU_CONTENT_DIR` | `<repo>/content` | Where template layers (`workspaces/<course>/<template>/`), `@` layers, and check suites are read from |
| `HU_WS_PORTS` (or `HU_PORT_RANGE`) | `23000-29999` | The workspace port range, as `first-last` |
| `HU_IDLE_MS` | `1200000` | A running workspace with no heartbeat, terminal input, or API call for this long stops (20 minutes) |
| `HU_WS_REMOVE_MS` | `86400000` | A stopped workspace's container is removed this long after it stopped (24 hours). Files and volumes stay |
| `HU_TERM_GRACE_MS` | `600000` | A terminal with no socket attached lives this long, so a reload reattaches (10 minutes) |
| `HU_WS_POLL_MS` | `1000` | How often a running workspace is read for listening ports, task exits, and limits |
| `HU_MEM_BUDGET_MB` | from Docker | Replaces the workspace memory budget (tests, or a machine where the estimate is wrong) |

Next.js finds the runner at `http://127.0.0.1:${HU_RUNNER_PORT}` and reads
the token from `HU_RUNNER_TOKEN`, or from `~/.hack-university/runner-token`
when it was started some other way. `npm run up` also sets `HU_RUNNER_URL`.

## Who may call it

Every `/v1` request:

1. must send `Host: 127.0.0.1:<port>` or `localhost:<port>`, else **403**
   `forbidden` (DNS rebinding);
2. must not send an `Origin` header, else **403** (only servers call the REST
   API, and a browser always sends `Origin` on these requests). `OPTIONS` is
   always **403** with no CORS headers;
3. must send `Authorization: Bearer <token>`, else **401** `unauthorized`
   with `WWW-Authenticate: Bearer`. The token is compared in constant time.

Bodies are JSON (`Content-Type: application/json`, else **415**), at most 8 MB
for `/v1/run` and 64 KB elsewhere (**413**), and checked against the schemas
in `schemas.ts` (**400** `bad_request`, naming the field). Unknown fields are
refused, so a typo fails loudly. The two routes that take a file's bytes
(`PUT …/file` and `POST …/upload`) take any content type, at most 1 MB and
5 MB.

Every error has one shape:

```json
{ "error": "docker_unavailable", "message": "Start Docker to run this." }
```

| Status | `error` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body failed its schema. `message` names the fields |
| 401 | `unauthorized` | No token, or the wrong one |
| 403 | `forbidden` | Wrong Host, an Origin header, a preflight, or an admin route without `X-HU-Admin: 1` |
| 403 | `outside` | A workspace path goes through a symbolic link, so the runner won't follow it |
| 404 | `not_found` | No such route, workspace, file, terminal, task, snapshot, or check |
| 405 | `method_not_allowed` | Wrong method |
| 413 | `too_large` | Body over its cap |
| 409 | `conflict` | A save whose `If-Match` no longer matches the file (the body also has the current `etag`) |
| 409 | `exists`, `not_a_file`, `too_many_terminals`, `not_running` | A rename, copy, or restore onto something that exists. A file route on a folder, link, or FIFO. A fifth shell. A request that needs the workspace running (the API panel, forwarding a port) |
| 415 | `unsupported_media_type` | Not JSON |
| 499 | `cancelled` | The caller hung up while its run was queued or running (the job is stopped) |
| 500 | `job_failed`, `internal` | Something broke in the runner or the sandbox. `message` says what |
| 501 | `not_implemented` | A route or option the architecture defines for a later phase (`/v1/pages/*`, `volume` storage, a database reset) |
| 502 | `not_listening` | An API panel request to a port nothing listens on |
| 503 | `docker_unavailable` | Docker is off ("Start Docker to run this."), or still waking up |
| 503 | `image_missing` | The recipe's image isn't built: run `npm run up` or `npm run images` |
| 503 | `busy` | 64 runs are already waiting for a job slot |
| 503 | `ports_exhausted` | Every workspace port is in use by a running workspace ("Stop one on /workspaces, or widen HU_WS_PORTS.") |
| 503 | `waiting_for_memory` | A terminal or task needs the workspace started, and its start is queued for memory (the `status` events say when it runs) |
| 504 | `timeout` | An API panel request ran past its `timeoutMs` |

## Routes

### `GET /v1/health`

Docker, the images, the jobs, and the memory budget. Cheap: it reads state the
runner keeps, refreshed every 5 seconds.

```json
{
  "docker": { "state": "ready", "serverVersion": "29.7.2", "apiVersion": "1.55", "arch": "aarch64",
              "memTotal": 8318976000, "ncpu": 14, "belowFloor": false },
  "images": { "hu/node": "ready", "hu/bash": "ready" },
  "recipes": {
    "typescript": { "image": "hu/node:be3ead7f4693", "state": "ready",
                    "versions": { "node": "26.12.0", "typescript": "7.0.2", "npm": "12.2.0" } },
    "bash": { "image": "hu/bash:b44fa28342ac", "state": "ready",
              "versions": { "bash": "5.3.20", "gawk": "5.4.1", "jq": "1.8.2", "shellcheck": "0.11.0", "bats": "1.14.0" } }
  },
  "services": { "postgres": "absent", "mongo": "absent", "piston": "running" },
  "workspaces": { "running": 0, "budgetMb": 5373, "reservedMb": 0 },
  "jobs": { "running": 0, "queued": 0, "slots": 4 },
  "runner": { "version": "0.1.0", "ns": "live", "boot": "41fcc6557cda", "port": 3100, "uptimeMs": 3887 }
}
```

- `docker.state` is `ready`, `down`, or `waking` (Docker Desktop's Resource
  Saver can take a few seconds to answer). The other `docker` fields are `null`
  while it's down. `belowFloor` is true under the 7.75 GiB floor that every
  course is tested with (`lib/docker-memory.mjs`, shared with `npm run up`).
- An image state is `ready`, `missing`, or `building`. `recipes.*.versions`
  come from the image's own `hu.versions` label, for the sandbox badge
  ("TypeScript 7.0.2 on Node 26.12.0", "Bash 5.3").
- `workspaces.budgetMb` is the memory left for workspaces and checks (see
  "Memory" under Workspaces), `running` the workspaces whose containers run,
  and `reservedMb` the memory they reserve.

### `POST /v1/run`

Runs a single-file program as one job: a fresh container, removed when it's
done. A **Run** (no `tests`) answers in Piston's shape, so `runInSandbox`,
`OutputPanel`, and `CheckResults` read it unchanged. A **Check** sends every
test at once and gets one result per test: TypeScript compiles once however
many tests there are.

```json
{
  "recipe": "typescript",
  "files": [{ "name": "main.ts", "content": "export function describe(p: Payment): string { … }" }],
  "stdin": "",
  "args": [],
  "env": {},
  "clock": "2026-10-01T09:00:00Z",
  "tests": [{ "stdin": "", "args": [], "env": {} }],
  "typeTests": {
    "imports": "import { describe, type Payment } from \"./main.ts\";",
    "cases": [
      { "name": "accepts a card", "expect": "ok", "code": "describe({ kind: \"card\", last4: \"4242\" });" },
      { "name": "rejects a card without last4", "expect": "error", "errorCode": "TS2345", "code": "describe({ kind: \"card\" });" }
    ]
  },
  "forbid": ["any", "as", "non-null", "ts-comments"]
}
```

| Field | Recipes | Meaning |
| --- | --- | --- |
| `recipe` | both | `typescript` or `bash`. Content names a recipe, never a command, an image, or a path |
| `files` | both | `[{name, content, encoding?, mode?, type?, target?, mtime?}]`. TypeScript takes exactly `main.ts`. Bash needs `main.sh` and may bring more files. `encoding` is `utf8` (default) or `base64`, `type` is `file` (default), `dir`, or `symlink` (with `target`), `mode` is the permission bits as a number (`493` for 0755), `mtime` an instant |
| `stdin`, `args`, `env` | both | The Run's input, arguments, and environment variables. A Check's tests start from the same `env` |
| `clock` | both | A frozen instant, or `null` for the real time. Tests inherit it and may set their own |
| `fixtures`, `fixtureSets` | bash | `fixtureSets` maps a set's name to its files (the same shape as `files`). `fixtures` names the set every run starts from |
| `tests` | both | 1 to 20 tests. Each may set `stdin`, `args`, `env`, `clock`, and for Bash `fixtures` (another set, so a hardcoded answer fails), `cwd` (a subfolder to run from), `wrap` (an argv the script runs inside, like `["flock", "job.lock"]`), `files` and `absent` (paths to read back), and `collect` (more paths). For TypeScript, `tryIt` replaces everything after the program's `// --- try it ---` line with hidden calls. `output`, `exitCode`, and `stderrIncludes` are accepted and ignored: `lib/single-checks.mjs` judges them |
| `typeTests` | typescript | Up to 6 cases, compiled with `main.ts` in the same tsc pass, never run. Each case is its own module after the imports line, so it may `declare const p: Payment;` and never sees another case's names |
| `forbid` | typescript | Accepted and ignored, like `output`. `lib/single-checks.mjs` judges the honesty rules from the source (architecture §3.5), so Check and the verifiers share one scanner. The runner returns no `forbid` field |

**Answer to a Run:**

```json
{
  "compile": { "stdout": "", "stderr": "", "code": 0, "signal": null, "status": null, "message": null,
               "output": "", "limit": null, "wall_time": 61 },
  "run": { "stdout": "card ending 4242\n", "stderr": "", "code": 0, "signal": null, "status": null,
           "message": null, "output": "card ending 4242\n", "limit": null, "wall_time": 70 },
  "timing": { "queueMs": 0, "startMs": 65, "loadMs": 14, "compileMs": 67, "runMs": 79, "totalMs": 225 }
}
```

**Answer to a Check:**

```json
{
  "compile": { "code": 0, "output": "", "…": "as above" },
  "results": [
    { "stdout": "card ending 4242\n", "stderr": "", "code": 0, "signal": null, "status": null, "message": null,
      "output": "card ending 4242\n", "limit": null, "wall_time": 60, "files": {}, "exists": {} }
  ],
  "typeTests": [
    { "name": "accepts a card", "expect": "ok", "pass": true, "diagnostics": [] },
    { "name": "rejects a card without last4", "expect": "error", "pass": true,
      "diagnostics": [{ "line": 1, "col": 10, "code": "TS2345", "message": "Argument of type … is not assignable …" }] }
  ],
  "timing": { "…": "…" }
}
```

- **`run`, `compile`, and each result** are Piston's run object: `stdout`,
  `stderr`, `output` (both, in the order written), `code` (the exit code, or
  `null` when the program died on a signal), `signal` (`"SIGKILL"` and so on),
  `status`, `message`, and `wall_time` in ms. `status` is `null` on success,
  `RE` for a non-zero exit, `SG` for a signal, `TO` past the time limit, `OL` or
  `EL` past 1 MB of stdout or stderr (the rest is cut, and the program is
  stopped at once), and `XX` when the step couldn't report. Unlike Piston,
  `exit 130` and a death by `SIGINT` are told apart (`docker/shared/hu-exec.c`).
- **`XX`** is never the program's fault. A sandbox stopped from outside (a
  Docker restart, the reaper after the Mac wakes from sleep) says `"message":
  "The sandbox stopped unexpectedly. Run it again."` with `code: null`, never
  Docker's 137 dressed up as an exit status. A test whose files couldn't be
  loaded or read back is `XX` too, with the reason on `stderr`, and the other
  tests still run and report.
- **`limit`** names what stopped it: `time`, `memory` (killed at 512 MB),
  `pids` (128 processes, a fork bomb), `fsize` (a 64 MB file), `output`, or
  `null`.
- **`compile`** (TypeScript only) is `tsc -p . --pretty false`. Its `output`
  holds only `main.ts`'s diagnostics, exactly as tsc prints them
  (`main.ts(1,7): error TS2322: …`). A type error makes `code` non-zero and
  stops the run: a Run then repeats the compile as its `run`, as Piston does
  for a C++ compile error, and a Check's results each say `"skipped": "compile"`.
- **`results[i].files`** holds the contents of every path test `i` named in
  `files`, `absent`, or `collect` (relative to the test folder, `null` where no
  regular file is), and **`exists`** says whether anything is there (a file, a
  folder, or a symlink, which isn't followed). Whether a path exists is read
  apart from any contents, so it is always right. Each file is read on its own,
  up to 1 MB, and up to about 9 MB in all.
- **`results[i].truncated`**, only when there are some: the paths whose
  contents were cut, of which `files` holds the first 1 MB. A judge must
  count a truncated file as not matching (`files` expectations are at most
  1 MB, so the whole file can't match), while `exists` still says it's there.
- **`typeTests`**: each case's diagnostics, with `line` and `col` counted from
  the start of the case's own code. `pass` follows the case's `expect` (and
  `errorCode`), and `message` says why a case failed. A diagnostic on the
  imports line fails every case ("The type tests couldn't import from main.ts").
- **`timing`** is for measuring, not for learners.

### `POST /v1/tickets`

`{ "workspace": "wk3j6q2m7xa", "kind": "events" }`, or `{ "workspace": …,
"kind": "term", "sid": "s1abcdef" }`, answers `{ "ticket": "…", "expiresAt":
1792400430000 }`: 32 random bytes, single use, valid for 30 seconds, bound to
the workspace, the socket kind, and (for a terminal) its session. Only a hash
of each ticket is kept, and tickets never appear in URLs or logs. The
workspace must exist (**404** otherwise), and a terminal ticket's `sid` must
be one of its terminals or task log views.

### `POST /v1/prewarm`

`{ "scope": "…" }` or `{ "course": "typescript" }` answers **204**. It never
creates a workspace, a lease, a listener, or a container, and never builds an
image, so a hover can call it freely. For the scope of a workspace that is
already open it reads the workspace's tree into memory, and otherwise it does
nothing yet.

### `POST /v1/stacks/:stack/prepare`

"Prepare this course": builds the stack's images in the background and
answers **202** `{ "stack": "typescript", "images": { "hu/node": "building" } }`.
The stacks so far are `typescript` and `bash`. Others answer 404 until their
phase. Progress shows in `/v1/health` (and as `image` events from P1).

### Admin routes

Need `X-HU-Admin: 1` as well as the token. Next never forwards them.

| Route | Does |
| --- | --- |
| `POST /v1/admin/reconcile` | Removes job containers an earlier run of this runner left (`{ "removed": [names] }`) |
| `POST /v1/admin/gc` | One reaper pass, and prunes old image tags (`{ "removed": [...], "prunedImages": [...] }`) |
| `GET /v1/admin/images` | `{ "node": { "tag": "hu/node:…", "state": "ready" }, … }` |
| `POST /v1/admin/images` | Builds `{ "names": ["node"] }` (or every image) in the background, **202** |

## Workspaces

A workspace is one project a learner works in (`architecture.md` §4.2): files
first, and a container (`hu-ws-<id>`) only while something runs. Next.js opens
one when a part's IDE mounts, and every route below takes its id. Every route
under `/v1/workspaces/:id/` except `PUT` answers **404** `not_found` for a
workspace that was never opened (or was deleted).

### Ids and scopes

`lib/workspace-id.mjs` (shared by Next, the browser, the runner, and the
verifiers) names each workspace by its scope and maps routes to scopes:

| Scope | Route |
| --- | --- |
| `learn/<course>/<lesson>/<part>/practice` | `/<course>/learn/<lesson>/<part>?tab=code` |
| `learn/<course>/<lesson>/<part>/example-<k>` | the same route with no tab (k = 1), `?tab=ex2`, or `?tab=ex3` |
| `learn/<course>/<lesson>/<part>/examples` | any example tab of a part whose template sets `"examples": "shared"` |
| `challenge/<course>/<id>` | `/<course>/challenges/<id>` |
| `playground/<course>` | `/<course>/playground` |
| `playground/<course>/<n>` | `/<course>/playground/<n>`, n from 1 to 3 |
| `sandbox/<course>/<template>` | `/<course>/playground/<template>` |

```js
import { workspaceId, scopeForRoute, routeForScope, parseScope } from "@/lib/workspace-id.mjs";
scopeForRoute("/typescript/learn/modules/2", { tab: "code" }); // "learn/typescript/modules/2/practice"
workspaceId("learn/typescript/modules/2/practice");             // "w" + 10 base32 characters
```

The id is `w` and the first 10 characters of the lowercase base32 of
SHA-256(scope), matching `^w[a-z2-7]{10}$`. `<part>` is the 1-based number the
URL shows. The module is plain JavaScript with its own SHA-256, so it is
synchronous everywhere (the browser can name `hu-ws-v1:<id>` before first
paint).

### States

`files` (never started, or its container was removed: files only) →
`starting` → `running` → `stopping` → `stopped`, and `error` when a start
failed (everything it did is undone). Editing, resetting, and snapshots work
in every state: they never need a container. One lock per workspace
serializes open, start, stop, reset, snapshots, check setup, and host-side
writes, so double clicks and two tabs can't race.

A running workspace stops after 20 minutes without heartbeats, terminal
input, or API calls (`HU_IDLE_MS`; server output doesn't count), when the
memory budget needs its room for a workspace you can see (LRU, below), or when
Docker stops. A stopped container is removed 24 hours later (`HU_WS_REMOVE_MS`),
and the next start recreates it in about 100 ms. Files, the home volume, and
port leases stay.

### `PUT /v1/workspaces/:id`

Next sends this after resolving content: the scope, the template, the layers
to stack, and the template's settings from its `template.json` (§6.7). The
browser never sends it. It is idempotent: the first call materializes the
files, and later calls return the live state. The id must be
`workspaceId(scope)`.

```json
{
  "scope": "learn/typescript/layered-service/1/practice",
  "template": "typescript/orders-service",
  "layers": ["base", "checkpoints/cp-05", "@learn/typescript/layered-service/part-1/practice/starter"],
  "image": "node",
  "storage": "host",
  "profile": "standard",
  "start": "run",
  "ports": [{ "env": "PORT", "label": "API", "readyPath": "/healthz", "preview": true }],
  "tasks": { "dev": { "cmd": "npm run dev", "label": "Server" }, "test": "npm test" },
  "env": { "NODE_ENV": "development", "HU_FIXED_TIME": "2026-10-01T09:00:00Z" },
  "build": ["dist"],
  "limits": { "memoryMb": 1024, "cpus": 2, "pids": 512 }
}
```

| Field | Meaning |
| --- | --- |
| `scope`, `template` | The workspace's scope, and `<course>/<template>` (the folder `content/workspaces/<course>/<template>/`) |
| `layers` | 1 to 32 layers, copied in order. `base` is the template's `base/`. `checkpoints/<cp>` and `examples/<id>` are the template's `<that folder>/overlay/`, then its `delete.txt`. `@<path>` is any folder under `content/` (a part's `practice/starter`, an `example-<k>`): its `overlay/` when it has one, else the folder itself without its top-level `delete.txt`, `transcript.json`, and `extends`, then its `delete.txt`. Next resolves `extends` chains and lists every layer |
| `image` | Optional: `node`, `bash`, `web`, `check-web`, `python`, `java`, or `go`. Without it, the course's runtime in `content/courses.json` picks the image (`runner/workspace-images.ts`: `runner:typescript` is `hu/node`, `runner:bash` is `hu/bash`, and so on). An image this runner can't build yet answers **503** `image_missing` at start, never at open |
| `storage`, `profile` | `host` (default) or `volume`, and `standard` (default) or `sysadmin`. See "Storage" below |
| `start` | `run` (default: the container starts on Run, a terminal, a task, or Check) or `open` (the IDE starts it right after opening) |
| `ports` | One entry per server: the variable that carries its port (`PORT`, `API_PORT`), a label, an optional `readyPath`, and `preview`. A template with none still gets `PORT` |
| `tasks` | The only commands Run, Stop, and the Server tab can start: a command string, or `{ cmd, label?, run? }` |
| `env` | Extra variables for the container. `HOME`, `HOST`, and the port variables always win |
| `limits` | Lower the course's caps (`memoryMb`, `cpus`, `pids`), never raise them |
| `build` | Folders that live on their own volume (`dist`, `.next`, `target`) |
| `hidden`, `readonly`, `restartOnReset`, `examples`, `deps`, `services`, `diagnostics` | Kept in `meta.json`. `deps` and `services` take effect in P2 |
| `id`, `course`, `title`, `layout`, `open`, `requests`, `panels`, `autosave` | Accepted so a `template.json` can be spread in, and ignored |

**200** `{ "id", "status", "templateHash", "created", "updated", "ports", "tree", "removed" }`:

- `created` is true when this call made the files.
- `templateHash` is 12 hex characters over the materialized manifest (below).
  When content ships a changed template, the next `PUT` rebuilds the original
  and `updated` lists every path whose original changed. The files you edited
  are never touched: the IDE shows "This codebase was updated" with Reset per
  file.
- `ports` maps each port variable to its lease, `{ "PORT": 23017 }`, empty
  before the first start.
- `tree` is the whole tree in the shape of `GET …/tree` (heavy folders such as
  `node_modules` are listed but not opened), and `removed` lists the original
  paths that are gone.

### `GET /v1/workspaces` and `GET`, `DELETE /v1/workspaces/:id`

`GET /v1/workspaces` lists every workspace (the `/workspaces` page):
`{ "workspaces": [{ id, scope, course, template, status, lastActiveAt, memLimitMb }], "budgetMb", "reservedMb" }`.

`GET /v1/workspaces/:id` answers
`{ id, scope, course, template, templateHash, status, detail, image, storage, createdAt, lastActiveAt, ports: [port], tasks: [task], terminals: [terminal], changes, lastCheck, mem }`,
where `mem` is `{ usedMb, limitMb }` while running.

`DELETE /v1/workspaces/:id` stops it and removes its container, volumes,
leases, and files. **204**.

### `POST /v1/workspaces/:id/start`, `/stop`, `/restart`

**200** `{ "status": "running" }` once the container runs (about 0.3 s warm),
or `{ "status": "stopped" }`. A start that doesn't fit the memory budget
answers **202** `{ "status": "starting", "queued": true, "detail": "Waiting for memory: …" }`
and proceeds by itself when memory frees (watch the `status` events). Starting:

1. the image must be built (**503** `image_missing` otherwise: "Prepare this course");
2. the start is admitted against the memory budget (below);
3. leases are taken for the declared ports (below);
4. `hu-ws-<id>` is created (first time) and started with its profile;
5. on the first start only, `git init` and a "Starting point" commit by
   "Hack University", so `git status` and `git diff` work as teaching tools;
6. the port bridges open and `status: running` goes out.

Stopping sends tasks `TERM` (then `KILL` after 5 s), closes terminals and the
bridges, and stops the container. Leases stay.

### Memory

The budget is Docker's `MemTotal`, less 512 MiB of headroom, less 2 GiB while
Piston runs, 768 MiB while `hu-postgres` runs, and 1 GiB while `hu-mongo`
runs, less the reserved check slot of the most demanding course open in a
visible tab (512 MiB for Bash, 1 GiB for TypeScript, Express, and FastAPI,
1.5 GiB for Web and React, 2 GiB for Go, Spring Boot, and Next.js, and 1 GiB
when no tab has sent a visible heartbeat in the last minute).
`HU_MEM_BUDGET_MB` replaces the whole calculation. Each running workspace
reserves its memory limit. A start that doesn't fit stops running workspaces
that no tab shows (no visible heartbeat for 60 s), least recently active
first, each with a `limit` event of kind `lru`. When none qualifies, the start
waits in a FIFO queue and proceeds when memory frees. A check never stops the
workspace it checks.

### Files

Paths are relative to the workspace root, `/`-separated, with no `.` or `..`
segment, no NUL, at most 4,096 bytes overall and 255 per segment. The runner
never follows a symbolic link on the Mac: a path that goes through one answers
**403** `outside` ("This path goes through a symbolic link"), and a link is
listed with its target, never opened. FIFOs, sockets, and devices are listed
and never opened (**409** `not_a_file`).

| Route | Body | Answers |
| --- | --- | --- |
| `GET …/tree?path=&depth=` | | `{ "path", "entries": [entry], "removed": [path], "more": { "<dir>": n } }`. `depth` is 1 (default) to 64. A folder lists at most 5,000 entries, and `more` says how many it left out. Heavy folders (`node_modules`, `.git`, `.venv`, `target`, `.next`, `dist`) are listed but only opened when `path` names them |
| `GET …/file?path=` | | A text file's bytes (`Content-Type: text/plain; charset=utf-8`), or for a binary file (a NUL in its first 8 KB, or not UTF-8) `{ "binary": true, "size", "mime", "etag" }`. `?raw=1` sends any file's bytes with its `mime`. Headers: `ETag: "<sha256 hex>"`, `X-HU-Size`, `X-HU-Mode` (decimal), `X-HU-Mtime` (ms). `If-None-Match` with the current etag answers **304**. Over 5 MB: **413** |
| `PUT …/file?path=` | The bytes (`application/octet-stream`, at most 1 MB), `If-Match: "<etag>"` | `{ "etag" }`. Without `If-Match` it overwrites. `If-Match` that no longer matches (the terminal changed the file) or names a file that is gone: **409** `conflict` with `etag` (the current one, or null). `If-None-Match: *` creates only (**409** when it exists). Missing folders are made |
| `GET …/original?path=` | | The starting version's bytes with its `ETag`, for diffs, resets, and the comments switch. **404** for a path the original doesn't have |
| `POST …/fs` | `{ "op", "path", "to"?, "mode"?, "undo"? }` | `{ "undo"? }`, see below |
| `POST …/upload?path=` | The bytes, at most 5 MB | `{ "etag" }`, overwriting |
| `GET …/changes` | | `{ "added": [path], "modified": [path], "removed": [path] }` against the manifest (files and links; heavy folders and `.git` aside) |
| `GET …/archive?git=` | | A zip of the files (`Content-Disposition: attachment`), without `.git` unless `git=1`, without the dependency and build folders, and without links (so none points outside), at most 200 MB |
| `POST …/carry` | `{ "from": "<scope>" }` | "Continue with my code": the files of another opened workspace (the previous part's practice) replace these, heavy folders and `.git` aside. `{ "restored", "removed", "snapshot" }`, with an automatic snapshot first for Undo. **404** when `from` was never opened |
| `POST …/reset` | `{ "scope": "file" \| "dir" \| "all" \| "db" \| "everything", "path"?, "dryRun"? }` | `{ "restored": [path], "removed": [path], "snapshot"? }`. `all` and `everything` save an automatic snapshot first (its id is `snapshot`, for Undo). `dryRun` answers what would change without changing it ("2 files restored, 1 new file removed"). `db` answers **501** until P2 |
| `GET …/snapshots` | | `{ "snapshots": [{ id, label, auto, createdAt }] }`, newest first. The last 5 automatic and 20 named are kept |
| `POST …/snapshots` | `{ "label"? }` | `{ id, label, auto: false, createdAt }`, a save point |
| `POST …/snapshots/:sid/restore` | | `{ "restored", "removed", "snapshot" }`, after saving an automatic snapshot of the current files |
| `DELETE …/snapshots/:sid` | | **204** |

**`entry`** (tree rows, and the third item of `fs` events):

```json
{ "name": "a.ts", "path": "src/a.ts", "type": "file", "size": 312, "mtimeMs": 1760864400000, "mode": 420, "state": "modified" }
```

- `type`: `file`, `dir`, `symlink`, `fifo`, `socket`, `mount` (a build or
  dependency volume, listed from inside the container), or `other`.
- `mode`: the permission bits (`420` is 0644, `493` is 0755).
- `target` (symlinks): the link text as written, and `outside: true` when it
  is absolute or climbs out of the workspace.
- `state`: `same`, `modified`, or `new` against the manifest. A folder is
  `modified` when anything under it differs, `new` when the original has no
  such folder.
- `heavy: true` on `node_modules` and the others above.

**`POST …/fs`** operations:

| `op` | Does |
| --- | --- |
| `mkdir` | Makes `path` and any missing parents |
| `rename` | Moves `path` to `to`. **409** `exists` when `to` exists |
| `copy` | Copies `path` to `to`, links as links. **409** `exists` when `to` exists |
| `delete` | Removes `path` (a file or a whole folder). Up to 50 MB goes to the trash first, and the answer's `undo` restores it for 24 hours |
| `chmod` | Sets `mode` (the permission bits) on `path` |
| `restore` | Puts back what a delete removed: `{ "op": "restore", "undo": "<from the delete>" }`. **409** `exists` when something new is there |

While the container runs, every save, `mkdir`, `rename`, `copy`, `delete`,
`chmod`, reset, and restore happens inside it (`docker exec` with argv, never
a shell string, as uid 1000), so inotify in the container sees it and dev
servers reload. While it is stopped, the runner writes on the Mac under the
workspace lock, refusing any path through a symbolic link. Reads always
happen on the Mac with `O_NOFOLLOW_ANY` and only open regular files.

**The manifest** (`meta.json`) maps every original path to its type, mode,
size, and SHA-256 (links to their target). It drives the `M` and `U` marks,
the Removed group, every reset, and `GET …/original`. `templateHash` is the
first 12 hex characters of SHA-256 over its lines,
`<path>\0<type>\0<mode octal>\0<sha256 or target>\n`, sorted by path.

### Storage

`host` storage keeps files in `HU_DATA_DIR/workspaces/<id>/files`, bind-mounted
at `/workspace`. It is the default and what every code course uses. `volume`
storage (the Bash course, so `chown`, groups, and setuid behave as on Linux)
opens (its files and settings are kept) but answers **501** `not_implemented`
at start until it lands, and so does the `sysadmin` profile that needs it.

### Terminals

| Route | Body | Answers |
| --- | --- | --- |
| `POST …/terminals` | `{ "cols", "rows", "cwd"? }` | `{ "sid" }`. Starts the workspace when it isn't running. At most 4 shells per workspace (**409** `too_many_terminals`) |
| `GET …/terminals` | | `[{ "sid", "kind": "shell" \| "log", "task"?, "cols", "rows", "exited", "createdAt" }]`, so a reload finds its sessions |
| `DELETE …/terminals/:sid` | | **204**. Ends the shell |

A shell is `bash -l` through `docker exec` with a TTY, `TERM=xterm-256color`,
`COLORTERM=truecolor`, in `/workspace` (or `cwd` under it), as uid 1000.
Everything it prints is mirrored into `@xterm/headless`, so a reattach within
10 minutes of the last socket closing (`HU_TERM_GRACE_MS`) replays the screen
and 5,000 lines of scrollback. Connect with `ws://127.0.0.1:3100/v1/ws/term/<sid>`
(below).

### Tasks

| Route | Answers |
| --- | --- |
| `GET …/tasks` | `[{ "name", "label", "cmd", "state": "idle" \| "starting" \| "running" \| "exited", "code", "signal", "startedAt", "sid" }]` |
| `POST …/tasks/:name/start` | `{ "sid", "state" }`. Starts the workspace first when needed. A task already running answers its `sid` |
| `POST …/tasks/:name/stop` | `{ "state" }`: `TERM` to its process group, `KILL` after 5 s |
| `POST …/tasks/:name/restart` | `{ "sid", "state" }` |
| `POST …/tasks/:name/signal` | `{ "sig": "INT" }` (or `TERM`, `HUP`, `KILL`) to its process group, for the Server tab's Ctrl+C. **204** |

Names come only from the workspace's `tasks`, so the browser never names a
command (**404** for any other name). A task runs detached as uid 1000 in
`/workspace` with `FORCE_COLOR=1`, `PY_COLORS=1`, and `CLICOLOR_FORCE=1`,
its output going to `/tmp/hu/proc/<name>.log` and its pid to
`/tmp/hu/proc/<name>.pid`, so it survives reloads, dropped sockets, and runner
restarts (the runner re-adopts it by its pid file). `sid` is a read-only log
view of it: a terminal socket that replays and follows the log, ignores
keystrokes, and turns a `signal` frame into a signal to the task. Each
start of a task truncates its log, and its view prints a dim
`── restarted ──` line. `task` events report every change.

### Ports and the bridge

When the container starts, each declared port variable gets a lease from
`HU_WS_PORTS` (default `23000-29999`, also read from `HU_PORT_RANGE`), and the
container gets `PORT=<lease>` (and `API_PORT=…`) and `HOST=0.0.0.0`: the same
number inside and outside, so the URL a server prints is the URL that works.
Leases persist in `HU_DATA_DIR/ports.json` with their scope and last use, so a
workspace keeps its origin (and its localStorage) across restarts. A lease is
pinned while its container runs. When the range is 90% full, the next lease
first frees unpinned leases, least recently used first, until it is below
80%. When every usable port is pinned, the start fails with **503**
`ports_exhausted`. The runner never leases 2000, 3000, 3100, 4099, or 4100,
skips 24678, 26257, 27017 to 27019, and 28017, and probes each port by binding
it on `127.0.0.1` and `::1`.

No container publishes a port. While the workspace runs, the runner listens on
each port on `127.0.0.1` and `::1` only (loopback, so nothing off the Mac can
reach it), and for each connection reads the request head (at most 16 KiB),
refuses any `Host` but `localhost:<port>`, `127.0.0.1:<port>`, or
`[::1]:<port>` (**421**, DNS rebinding: browsers pool connections per origin,
so checking a connection's first request covers it), answers
`/__hu/clear-site-data` itself (`Clear-Site-Data: "storage"`, then a redirect
to `/`), and otherwise pipes the connection through
`docker exec hu-ws-<id> socat -T600 STDIO TCP:127.0.0.1:<port>` as uid 1000.
Nothing listening yet gives a small **503** page ("Nothing is listening on
port 23017 in this workspace yet. Press Run."). At most 64 connections per
workspace.

Every second while the workspace runs, the runner reads `/proc/net/tcp` and
`/proc/net/tcp6` inside it. A new listening port is announced with a `port`
event. One the workspace has no lease for is forwarded at once: to the same
number when the Mac has it free and it isn't reserved, otherwise to a fresh
lease, with the reason in `note` ("3000 is Hack University itself on your
Mac. Forwarded to 23021."). Such forwards last while the workspace runs.

| Route | Body | Answers |
| --- | --- | --- |
| `GET …/ports` | | `[port]` |
| `POST …/ports` | `{ "port": 5173 }` (the port inside) | `port`: forward an undeclared port now |
| `DELETE …/ports/:port` | | **204**: stop forwarding (declared ports keep their lease) |

**`port`**, in lists and `port` events:

```json
{ "port": 23017, "target": 23017, "url": "http://localhost:23017", "env": "PORT", "label": "API",
  "state": "listening", "bind": "0.0.0.0", "process": "node", "framable": true, "reason": null,
  "declared": true, "preview": true, "note": null, "clearSiteData": false }
```

- `port` is the number on the Mac, `target` the number inside (equal unless
  `note` says why not), `url` uses `localhost`.
- `state` is `listening` or `closed`. `bind` is the address the server bound
  inside (`0.0.0.0`, `127.0.0.1`, `::`, `::1`): a `127.0.0.1` bind still works
  through the bridge, and the Ports panel shows the `--host 0.0.0.0` fix.
- `framable` and `reason` come from a `GET /` through the bridge when the port
  starts listening: `false` with `"X-Frame-Options: DENY"` or the CSP
  `frame-ancestors` that refuses the app, so the preview can explain itself.
- `clearSiteData` is true on a lease that last belonged to another scope: the
  IDE loads `http://localhost:<port>/__hu/clear-site-data` once before the
  first preview, so no lesson sees another's storage.

### `POST /v1/workspaces/:id/http`

The API panel's request runner. It reaches the server through the same exec
bridge (no host port needed), only on this workspace's ports.

```json
{ "port": 23017, "method": "POST", "path": "/tasks?x=1", "headers": { "content-type": "application/json" },
  "body": "{\"title\":\"t\"}", "bodyEncoding": "utf8", "jar": true, "timeoutMs": 30000 }
```

`port` is the Mac-side number (a forwarded port's `target` works too).
`bodyEncoding` is `utf8` (default) or `base64`. With `jar` (default true) the
workspace's cookie jar sends its cookies and keeps the ones the response
sets, so login flows work. `DELETE …/cookies` empties the jar (**204**).

**200**:

```json
{ "status": 201, "statusText": "Created", "headers": { "content-type": "application/json" },
  "cookies": [{ "name": "sid", "value": "…", "path": "/", "httpOnly": true, "sameSite": "Lax", "expires": null }],
  "body": "{\"id\":42}", "bodyEncoding": "utf8", "size": 9, "truncated": false, "timingMs": 12 }
```

`headers` holds every response header (repeated ones joined with `, `, except
`set-cookie`, which is an array). `body` is text when it decodes as UTF-8, else
`base64`, and stops at 1 MB with `truncated: true`. A port that isn't one of
the workspace's gives **404**, one nothing listens on **502** `not_listening`,
and a request past `timeoutMs` (at most 120 s) **504** `timeout`.

### Checks

`POST /v1/workspaces/:id/check` `{ "suite": "<folder under content/>", "target": { … } }`
answers **202** `{ "checkId": "c…" }`, then `check` events stream one row per
finished test. `suite` names the folder that holds `suite.json`
(`workspaces/typescript/playground/checks/template`, or a part's
`learn/<course>/<lesson>/part-<n>/practice/checks`). `target` is echoed into
the result (`{ "course", "lesson", "part" }` or `{ "course", "challenge" }`).
`GET /v1/checks/:checkId` answers the result so far, or the final one, for a
socket that dropped (results are kept for the last 200 checks, and the
workspace's last in `meta.json`).

A check never touches the learner's container: the runner copies the files
(a `tar -c` inside the container while it runs, the Mac's files with no link
followed while it is stopped, without `.git` unless `copy.git`, and without
`copy.exclude`, `node_modules`, and build folders) into a fresh job container
from the suite's `image` (default: the workspace's), on a tmpfs `/work` of
512 MB, with the course's check limits (1 GiB, 2 CPUs, 512 processes for
TypeScript), network `none`, `TZ=UTC`, `LANG=C.UTF-8`, and the workspace's
`env`. Then it starts `server` when the suite has one (its `task`'s command
with the port variable set, ready when `ready.path` answers below 500 within
`ready.timeoutMs`), runs every step in order (a failing step never stops the
next), and removes the container. Past `deadlineMs` (default 60 s) the run is
killed and keeps its partial results with status `timeout`.

| Kind | Spec | Passes when |
| --- | --- | --- |
| `cmd` | `run` (argv), `cwd`, `timeoutMs` (default 30 s), `expect: { exit, stdout, stdoutRegex, stdoutIncludes, stderrIncludes }`, `parse: "tsc"` | Every expectation holds. `stdout` is exact. `parse` turns the first `file(line,col)` into `location` |
| `http` | `steps: [{ method, path, headers, json \| body, save, expect: { status, headers, json, jsonExact, bodyIncludes } }]` | Every request matches. `json` is a subset match where `"$int"`, `"$number"`, `"$string"`, `"$bool"`, `"$uuid"`, `"$rfc3339"`, `"$len:N"`, `"$absent"`, and `"$any"` stand for values. `save: { "id": "$.id" }` keeps a value for later steps as `{{id}}`. A failure carries the request and response |
| `process` | `server` (optional `{ task }` or `{ cmd }`, default the suite's), `script: [{ request, async? } \| { sleep } \| { signal } \| { await } \| { exit: { code, within } } \| { log: { contains, notContains } }]` | Every step holds: a fresh server per script, signals go to its process, `exit` waits for it to end |

Other kinds (`unit`, `types`, `files`, `structure`, `observe`, `mutants`,
`sql`, `mongo`, `dom`, `http-file`) answer an `error` row ("This check kind
isn't supported yet"), so nothing passes by accident.

**The result** (§7.3):

```json
{
  "version": 1, "checkId": "c7m2xqa3k9", "target": { "course": "typescript" }, "status": "failed", "durationMs": 1840,
  "tests": [
    { "id": "start", "title": "npm start prints the greeting", "kind": "cmd", "status": "fail",
      "message": "The output differs", "expected": "Hello, TypeScript!\n", "actual": "Hello!\n", "ms": 140 },
    { "id": "health", "title": "GET /healthz answers 200", "kind": "http", "status": "pass", "ms": 9,
      "request": { "method": "GET", "path": "/healthz", "headers": {}, "body": "" },
      "response": { "status": 200, "headers": { "content-type": "application/json" }, "body": "{\"ok\":true}" } }
  ],
  "infra": null,
  "logs": { "server": "the last 200 lines" }
}
```

- The run is `running` (while it runs), `passed` (every test passes),
  `failed`, `error` (the suite couldn't run, see `infra`), or `timeout`. A
  test is `pass`, `fail`, `error`, or `skip`.
- `infra` is null or `{ "kind": "copy" | "image" | "server" | "timeout" | "crash", "message" }`,
  which the IDE shows as an error card, never as failing tests.
- `title` is the suite's `acceptance` sentence for the step, else its id.
- Caps: 200 tests, 8 KiB per field, 256 KiB per result. Everything that came
  from learner code is text.

## WebSockets

`ws://127.0.0.1:3100/v1/ws/events` (one per open workspace) and
`ws://127.0.0.1:3100/v1/ws/term/<sid>` (one per terminal). The browser uses
`127.0.0.1`, never `localhost`, so the `localhost` cookies previews set never
ride along. No cookie is ever used for authentication.

1. The upgrade needs the runner's own `Host` and the app's `Origin`
   (`http://localhost:3000` or `http://127.0.0.1:3000`, following `PORT`).
   Anything else gets HTTP **403** before a socket exists, and an unknown path
   **404**.
2. The first message must be a hello with a ticket from `POST /v1/tickets`,
   within 5 seconds. The socket closes with **4401** for a missing, reused,
   unknown, or expired ticket, **4403** for a ticket of another kind or
   another terminal, **4400** for a first message that isn't a hello, and
   **4404** when the workspace or terminal doesn't exist. A ticket is spent
   the moment it's presented, even when it doesn't match.
3. Frames are at most 64 KiB. The runner pings every 25 s.

### The events socket

| Direction | Message |
| --- | --- |
| Client to runner | `{"t":"hello","ticket":"…","since":41}`, first. `since` is the last `fs` sequence the client applied, for a gapless resume (leave it out on a first load) |
| Client to runner | `{"t":"hb","visible":true}` every 30 s while the tab shows this workspace. It keeps the idle timer from firing, and `visible` keeps the workspace out of LRU stops for 60 s (send `false` when the tab is hidden) |
| Runner to client | `{"t":"ready","workspace":"wk3j6q2m7xa","seq":42,"resync":false}`, then a `status`, a `docker`, and one `port` and `task` message for each current port and task. `resync: true` means the batches after `since` are gone (the runner keeps the last 500): fetch the tree again. Otherwise the batches after `since` follow, in order |
| Runner to client | `{"t":"status","status":"running","detail":null,"mem":{"usedMb":312,"limitMb":1024}}`. `status` is a state from "States". `detail` says why ("Waiting for memory: 2 workspaces you have open use 3.5 of 3.5 GiB", "Docker is off", "Stopped after 20 minutes without activity"). `mem` comes from the container's cgroup, every 5 s while running, else null |
| Runner to client | `{"t":"fs","seq":43,"events":[["add","src/a.ts",entry],["change","package.json",entry],["unlink","tmp/x"],["addDir","src/dto",entry],["unlinkDir","tmp"]]}`, batched every 50 ms. `entry` is the tree row of the path. Heavy folders report only themselves, never what's inside. A folder that arrives whole (a `mv` into the workspace, `git checkout`) reports every path in it |
| Runner to client | `{"t":"port", …port}`, when a port opens, closes, or changes (see "Ports") |
| Runner to client | `{"t":"task","name":"dev","state":"starting\|running\|exited","code":1,"signal":null,"sid":"…"}` |
| Runner to client | `{"t":"check","checkId":"c7m2xqa3k9","phase":"copy\|server\|tests\|done","test":{…}}`: a `tests` message carries one finished test, and `done` carries the whole `result` |
| Runner to client | `{"t":"limit","kind":"oom\|pids\|fsize\|idle\|lru","message":"Your workspace used more than its 1 GB and a process was stopped"}` |
| Runner to client | `{"t":"terminal","sid":"…","state":"exited","code":0}` when a shell ends |
| Runner to client | `{"t":"docker","state":"up\|down\|waking"}` |

Several tabs may hold events sockets for one workspace, and each gets every
message.

### The terminal socket

| Direction | Frame | Message |
| --- | --- | --- |
| Client to runner | text | `{"t":"hello","ticket":"…","cols":120,"rows":32}`, first, so the first prompt wraps right |
| Runner to client | text | `{"t":"ready","sid":"…","cwd":"/workspace","shell":"bash","kind":"shell","task":null,"readonly":false}` (a log view has `"kind":"log"`, its `task`, and `"shell":null`), then `{"t":"replay","data":"…"}` with the serialized screen and up to 5,000 lines of scrollback when there is any (always on a reattach): write it into the terminal before any output |
| Both | binary | Keystrokes in, output out, as raw bytes |
| Client to runner | text | `{"t":"resize","cols":132,"rows":30}` |
| Client to runner | text | `{"t":"ack","bytes":131072}`: flow control, the output bytes the terminal has written since the previous ack (from `term.write(data, callback)`). The runner pauses the shell's output above 100,000 unacknowledged bytes and resumes below 10,000 (the xterm.js guide's numbers), so Ctrl+C answers at once during `yes`. Only the writer's acks count, and a read-only socket that falls 8 MB behind is closed (4408) |
| Client to runner | text | `{"t":"signal","sig":"INT"}` from a Stop button: Ctrl+C for a shell, the signal to the process group for a task's log view |
| Client to runner | text | `{"t":"takeover"}` |
| Runner to client | text | `{"t":"mode","readonly":true}` when another tab takes over, and `false` when this one does |
| Runner to client | text | `{"t":"exit","code":0,"signal":null}` when the shell ends (a log view never exits: its task's `task` events say how it ended) |
| Both | text | `{"t":"ping"}`, answered with `{"t":"pong"}` |

Each terminal has one writer: the first socket to attach, or the last one to
send `takeover`. Every other socket is read-only (keystrokes, resizes, and
signals are ignored) until it takes over. Closing the socket keeps the shell
for 10 minutes, so a reload reattaches with the same `sid` and a fresh
ticket. A task's log view (`kind: "log"`, `readonly: true` for everyone)
accepts only `signal`.

## Recipes

| Recipe | Image | In the job | Steps | Limits |
| --- | --- | --- | --- | --- |
| `typescript` | `hu/node` | `/work`: `main.ts`, the course `tsconfig.json`, `package.json` with `"type": "module"` (without it tsc treats `main.ts` as CommonJS), `type-test-<n>.ts` for each type-test case (the imports line, then the case, as its own module), and `t<n>/main.ts` for each `tryIt` test | `tsc -p . --pretty false` once, then `node main.ts` per test, from a fresh copy each time (with `docker/node/stdio.mjs` preloaded, so a program printing in a loop meets the 1 MB limit instead of running out of heap) | 512 MB, 1 CPU, 128 processes, 64 MB of space, compile 30 s, run 10 s, 1 MB per stream |
| `bash` | `hu/bash` | `/home/learner` (the home folder): the fixture set, then `main.sh` | `bash main.sh ARGS` per test, from a fresh copy each time, inside `wrap`, inside `faketime @<clock>` when there's a clock | 512 MB, 1 CPU, 128 processes, 64 MB of space, run 10 s, 1 MB per stream |

- **A fresh copy** means that before every test after the first, the work
  folder, `/tmp`, `/dev/shm`, and `/dev/mqueue` (everywhere a job can write)
  are emptied and the files extracted again, so a program passes or fails the
  same whichever test it is: a `mkdir /tmp/job.lock`, a `mktemp` file, or a
  line appended to `log.txt` never reaches the next test. Modes come back
  first, so a test that ran `chmod -R a-x .` doesn't stop the next.

- Programs import `node:` built-ins and `zod` (4.6.7), found through
  `/node_modules` in the image. tsc finds `@types/node` the same way.
- `HU_FIXED_TIME` carries the clock to every program. Bash also runs under
  `faketime`, with `NO_FAKE_STAT=1` so file times stay as they are on disk:
  a fixture's `mtime` and `touch -d "3 days ago"` are exact against the frozen
  now. A file a script creates gets the real time from the kernel, and the
  static jq and ShellCheck ignore faketime.
- Bash runs as `learner@devbox` with `TZ=UTC`, `LC_ALL=C.UTF-8`, and
  `TERM=dumb`, in the same folder for a Run and every test, so `pwd` and `~`
  never depend on which test printed them. From `cwd`, the script runs as
  `../main.sh`, the way you'd type it standing there.
- Every step goes through `hu-exec` (`docker/shared/hu-exec.c`), which stops
  it at its deadline, kills whatever it left running (so a background job
  never leaks into the next test), and reports exactly how it ended. It spares
  only PID 1, the job's main process (the oldest child of PID 1), itself, and
  the runner's own execs (whose parent is outside the container), never a
  process by its name: a learner's process called `hu-exec` goes too.

## Jobs and containers

A job is one container (`architecture.md` §4.1): created from the recipe's
image with the `job` profile, started as `hu-exec --idle` under tini, loaded
with `tar -x` on stdin (Docker's archive API refuses a read-only root), run
step by step, then removed. The answer goes out before the container is
removed, and a job holds its slot until it is gone, so at most `HU_JOB_SLOTS`
job containers ever exist. Past its whole deadline a job's container is
killed.

The `job` profile (`profiles.ts`, §11.2 and §11.3): uid 1000, every capability
dropped, `no-new-privileges`, the default seccomp profile, a read-only root,
network `none` (loopback only), no mounts and no published ports, private IPC
and cgroup namespaces, 512 MB of memory with no swap, 128 processes, `nofile`
4096/8192, `fsize` 64 MB, tmpfs `/work` (or `/home/learner`) and `/tmp` of
64 MB, OOM score +500, and no logs. One CPU is counted over a 1 s period
instead of Docker's 100 ms, so tsc's short multithreaded burst isn't
throttled from about 60 ms into 90 to 170 ms, while a busy loop still gets one
CPU on average. The `standard` and `sysadmin` workspace profiles are here too,
for P1, and `verify-security` already holds them to S1 and S2.

Labels (§5.3): `hu.managed=1`, `hu.kind=job`, `hu.ns`, `hu.runner=<boot id>`,
`hu.port`, `hu.recipe`, and `hu.expires`. At startup, once it holds its port,
the runner removes jobs its port left behind (a `kill -9` mid-run), and every
5 seconds it removes any job in its namespace 10 s past `hu.expires`. It acts
on nothing without its labels. On Ctrl+C it removes its own jobs before
exiting.

Files go in with `tar -x` and come back as a listing (what is at each path)
followed by each regular file's first bytes in base64, one line per file, so
nothing read from the container is trusted for a length. `tar.ts` still reads
archives (P1 needs them) and stops at the first header that doesn't add up.

## Workspace containers

`hu-ws-<id>` (`hv-ws-<home>-<id>` in the verify namespace, where `<home>` is
8 hex characters of the data folder's hash, so two verify runners never
share a container) runs `/opt/hu/bin/hu-init` under tini with the profile of
§11.2:

- **`standard`** (every code course): uid 1000, every capability dropped,
  `no-new-privileges`, a read-only root, no privileges, private IPC and cgroup
  namespaces, network `none` (`hu-db` from P2, for templates with a database),
  memory equal to memory plus swap, CPUs, processes, `nofile` 4096/8192,
  `fsize` 512 MB, OOM score +500, `/tmp` a 256 MB tmpfs (512 MB for Go), the
  files bind-mounted at `/workspace`, `hu-ws-<id>-home` at `/home/learner`, and
  one `hu-ws-<id>-build-<name>` volume per `build` folder. No published ports,
  devices, sysctls, extra hosts, or host environment.
- **`sysadmin`** (Bash): as in `profiles.ts`, root inside with Docker's default
  capabilities minus `NET_RAW`, `MKNOD`, `SYS_CHROOT`, and `SETFCAP`, no host
  mounts, network `none`. It needs volume storage.

The image comes from the course (`runner/workspace-images.ts`), and the limits
from §11.3, lowered by the template's `limits`:

| Course | Image | Memory | CPUs | Processes | `/tmp` | Check slot |
| --- | --- | --- | --- | --- | --- | --- |
| `typescript` | `hu/node` | 1 GiB | 2 | 512 | 256 MB | 1 GiB |
| `bash` | `hu/bash` | 512 MiB | 1 | 256 | 256 MB | 512 MiB |
| `express` | `hu/web` | 1 GiB | 2 | 512 | 256 MB | 1 GiB |
| `web`, `react` | `hu/web` | 1.5 GiB | 2 | 512 | 256 MB | 1.5 GiB |
| `nextjs` | `hu/web` | 2 GiB | 2 | 512 | 256 MB | 2 GiB |
| `fastapi` | `hu/python` | 1 GiB | 2 | 256 | 256 MB | 1 GiB |
| `go-api` | `hu/go` | 1.5 GiB | 2 | 512 | 512 MB | 2 GiB |
| `spring` | `hu/java` | 1.5 GiB | 2 | 512 | 256 MB | 2 GiB |

The images lane registers each new image in `runner/images.ts` (`IMAGES`) and,
for a course whose image isn't the default above, in `COURSE_IMAGES` in
`runner/workspace-images.ts`. Until an image is registered and built, its
course's workspaces open (files work) and answer **503** `image_missing` at
start.

Labels: `hu.managed=1`, `hu.kind=workspace`, `hu.workspace=<id>`, `hu.ns`,
`hu.home`, `hu.runner=<boot id>`, `hu.port`. Volumes carry `hu.managed`,
`hu.ns`, `hu.home`, and `hu.workspace`. At startup (and whenever Docker comes
back) the runner re-adopts its running workspace containers: bridges reopen,
tasks are found again by their pid files, and terminals start fresh. It never
touches a container without its namespace and `hu.home`.

## On disk

```
HU_DATA_DIR/                       ~/.hack-university by default
  runner-token                     0600
  ports.json                       leases: { version, leases: [{ port, scope, env, lastUse }], freed: [port] }
  workspaces/<id>/
    meta.json                      scope, template, layers, templateHash, manifest, config, ports, snapshots, lastCheck, times
    original/                      the materialized layers (APFS clones), the source of resets and GET …/original
    files/                         the learner's files, bind-mounted at /workspace
    snapshots/<sid>/               save points and automatic snapshots (APFS clones of files/)
    trash/<token>.tar, .json       deleted entries, kept 24 hours
  logs/runner.log
```

`original/`, `files/`, and snapshots are made with `/bin/cp -c -R -P` (argv,
no shell): copy-on-write clones on APFS that keep links as links, falling
back to a plain recursive copy on other file systems.

## Images

`docker/<name>/Dockerfile`, built with the `docker/` folder as context and
tagged `hu/<name>:<sha12>` of the Dockerfile and every file it copies, so a
rebuild happens only when they change. The previous tag is kept and older
ones pruned. Bases are pinned by digest and every download by SHA-256.

| Image | From | Adds | First build |
| --- | --- | --- | --- |
| `hu/node` | `node:26.12.0-trixie-slim` | npm 12.2.0, TypeScript 7.0.2 (the native `tsc`), `@types/node` 26.6.5, zod 4.6.7, bash, git, curl, jq, less, nano, procps, socat, tree | about 1 min |
| `hu/bash` | `debian:trixie-slim` (13.7) | Bash 5.3 patch 20 and gawk 5.4.1 built from source, the static jq 1.8.2 and ShellCheck 0.11.0, bats-core 1.14.0 with bats-support, bats-assert, and bats-file, faketime, cron, sudo, git, sqlite3, man pages, socat, python3 | about 2 min |

Both run as `learner` (uid 1000), have `hu-exec` and `hu-init` in
`/opt/hu/bin`, and fail their own build if a pinned version drifts.
`npm run images` builds what's missing, `npm run images -- bash --force`
rebuilds one, and `npm run images:status` lists them.

## Source files

```
main.ts          token, Docker, reconcile, the reaper, listen
config.ts        environment variables
auth.ts          the token, tickets, and the Host and Origin rules
http.ts          the REST routes, body caps, and errors
ws.ts            the WebSocket upgrade and the ticket handshake
schemas.ts       zod schemas for every body
docker.ts        finding Docker, the connection, labels, and namespaces
images.ts        content-hash tags, builds, pruning (and npm run images)
jobs.ts          the job primitive and the job pool
profiles.ts      container profiles and limits (§11.2, §11.3)
recipes/         typescript and bash
reaper.ts        reconcile at startup, and the reaper
tar.ts           just enough tar to load files in, and to read archives safely
workspaces.ts    workspaces: identity, states, locks, materializing, start and stop, idle and LRU stops
workspace-routes.ts  the /v1/workspaces and /v1/checks routes
workspace-images.ts  the course to image table, and each course's limits
storage/host.ts  host files: O_NOFOLLOW_ANY reads, safe host writes, cp -c clones, the manifest
storage/container.ts  the same operations inside a running container, through docker exec
exec.ts          docker exec helpers: collect, stream, detach
watch.ts         FSEvents on the files folder, batched into fs events
events.ts        each workspace's event hub, with the fs replay buffer
terminals.ts     shells and task log views: exec TTYs, the headless mirror, replay, flow control
tasks.ts         detached tasks with pid files, and the per-second poll (ports, exits, limits)
ports.ts         the lease table and ports.json
tunnel.ts        the port bridge, the API panel's requests, the framing probe
capacity.ts      the memory budget, LRU stops, and the queue
checks/          the check sandbox: suite schema, cmd, http, and process steps, results
test-fixtures/   content for the workspace tests: the TypeScript playground template and a part overlay
log.ts           ~/.hack-university/logs/runner.log
verify.ts        the library the verifiers import (verify namespace)
bench.ts         times the job path end to end against the budgets
```

## Tests

- `npm run runner:test` runs the unit tests (tokens, tickets, the Host and
  Origin rules, schemas, recipe commands, type-test layout, profiles and
  limits, labels, tar from good and malformed bytes, the exec stream, the job
  pool, image hashes and builds, the REST and WebSocket front door on a real
  server, workspace ids and routes, port leases with 1,000 scopes and reclaim,
  host path safety with links and FIFOs, check matchers, and the memory
  budget), and two suites against real Docker that skip when Docker is off or
  the images aren't built:
  - `runner/integration.test.ts` runs real jobs (test isolation, read-back,
    outside kills);
  - `runner/workspaces.test.ts` runs real workspaces through a real runner in
    the verify namespace, on the TypeScript playground template in
    `runner/test-fixtures/content` plus a part overlay with a small server:
    materializing and a full reset reproduce the manifest hash, paths through
    links or out of the root are refused stopped and running, a file made in
    a terminal arrives as an `fs` event within 1 s, a terminal survives a
    reattach with its scrollback, flow control and Ctrl+C during `yes`, one
    writer per terminal, a task's server answers on its leased port from the
    Mac (and `Host: evil.example` gets 421) and through the API panel with its
    cookie jar, a detected port is forwarded, two workspaces never share a
    port, cmd, http, and process checks pass and fail when they should, and an
    idle workspace stops. Set `HU_TEST_DATA_DIR`, `HU_TEST_RUNNER_PORT`, and
    `HU_TEST_WS_PORTS` to keep its runners' data, port, and leases where you
    want them. It removes every container and volume it made.
- `npm run security:verify` runs S1 (hardening), S2 (egress), S4 (limits), S9
  (runner auth), S14 (cleanup after `kill -9`, and a second runner on a taken
  port), and S16 (Piston) against real containers and a real runner in the
  verify namespace.
- `node runner/bench.ts` times Run and Check against a running runner.
- Type-check with `npx tsc -p runner`.
