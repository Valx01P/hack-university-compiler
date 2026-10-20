# hu-runner

The workspace runner: the one local service that talks to Docker. It runs
learner code in hardened, throwaway containers, and later (P1 on) workspaces,
terminals, and checks. It is TypeScript run directly by Node's type stripping
(Node 24.12 or newer), with no build step, and listens on `127.0.0.1:3100`.

```
browser ──▶ Next.js /api/* ──(bearer token)──▶ hu-runner 127.0.0.1:3100 ──(Docker API)──▶ hu-job-<uuid>
browser ──(ws://127.0.0.1:3100, ticket first)──▶ hu-runner
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

Design: `architecture.md` §2.6, §3.2, §3.3, §3.5, §4.1, §11 in the expansion
plan. This file is the contract the app codes against.

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
refused, so a typo fails loudly.

Every error has one shape:

```json
{ "error": "docker_unavailable", "message": "Start Docker to run this." }
```

| Status | `error` | When |
| --- | --- | --- |
| 400 | `bad_request` | The body failed its schema. `message` names the fields |
| 401 | `unauthorized` | No token, or the wrong one |
| 403 | `forbidden` | Wrong Host, an Origin header, a preflight, or an admin route without `X-HU-Admin: 1` |
| 404 | `not_found` | No such route |
| 405 | `method_not_allowed` | Wrong method |
| 413 | `too_large` | Body over its cap |
| 415 | `unsupported_media_type` | Not JSON |
| 499 | `cancelled` | The caller hung up while its run was queued or running (the job is stopped) |
| 500 | `job_failed`, `internal` | Something broke in the runner or the sandbox. `message` says what |
| 501 | `not_implemented` | A route the architecture defines for a later phase (`/v1/workspaces/*`, `/v1/checks/*`, `/v1/pages/*`) |
| 503 | `docker_unavailable` | Docker is off ("Start Docker to run this."), or still waking up |
| 503 | `image_missing` | The recipe's image isn't built: run `npm run up` or `npm run images` |
| 503 | `busy` | 64 runs are already waiting for a job slot |

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
- `workspaces.budgetMb` is Docker's memory, less 512 MiB of headroom, less
  2 GiB while Piston runs (§4.7). Workspaces arrive in P1, so `running` and
  `reservedMb` are 0.

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
of each ticket is kept, and tickets never appear in URLs or logs. In P0 any
well-formed workspace id is accepted, since workspaces arrive in P1.

### `POST /v1/prewarm`

`{ "scope": "…" }` or `{ "course": "typescript" }` answers **204**. It never
creates a workspace, a lease, a listener, or a container, and never builds an
image, so a hover can call it freely. In P0 it has nothing to warm yet.

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

## WebSockets

`ws://127.0.0.1:3100/v1/ws/events` (one per open workspace) and
`ws://127.0.0.1:3100/v1/ws/term/<sid>` (one per terminal). The browser uses
`127.0.0.1`, never `localhost`, so the `localhost` cookies previews set never
ride along. No cookie is ever used for authentication.

1. The upgrade needs the runner's own `Host` and the app's `Origin`
   (`http://localhost:3000` or `http://127.0.0.1:3000`, following `PORT`).
   Anything else gets HTTP **403** before a socket exists, and an unknown path
   **404**.
2. The first message must be `{"t":"hello","ticket":"…"}` within 5 seconds.
   The socket closes with **4401** for a missing, reused, unknown, or expired
   ticket, **4403** for a ticket of another kind or another terminal, and
   **4400** for a first message that isn't a hello. A ticket is spent the
   moment it's presented, even when it doesn't match.
3. An events socket then gets `{"t":"ready","workspace":"wk3j6q2m7xa","seq":0}`
   and `{"t":"docker","state":"up"}`, and another `docker` message whenever
   Docker goes `up`, `down`, or `waking`. Heartbeats (`{"t":"hb"}`) are
   accepted. Workspace events (`status`, `fs`, `port`, `task`, `check`, …)
   arrive in P1.
4. Terminals arrive in P1: a terminal ticket that checks out closes with
   **4404** until then.

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

## Databases

PostgreSQL and MongoDB for workspaces, checks, and single-file runs
(`architecture.md` §2.4, §2.5, §4.5, §11.2, PLAN.md 3.7 and B.1), in
`runner/db/`. Learner text never runs inside the shared servers (invariant
I3): the runner sends them only its own fixed SQL and admin helpers, filled
with names it checked, and everything a learner or a template wrote runs as
that learner's own role, from a client container or a connection logged in as
them.

### The servers

| | PostgreSQL | MongoDB |
| --- | --- | --- |
| Container | `hu-postgres` | `hu-mongo` |
| Image | `postgres:18.6-alpine`, pinned by digest | `mongo:8.0.34`, pinned by digest, or `mongo:7.0.45` where 8.x can't start (below) |
| Network | `hu-db` (internal: no gateway, no internet, no `host.docker.internal`), alias `db`, no published port | `hu-db`, alias `mongo`, no published port |
| Data | volume `hu-pgdata` at `/var/lib/postgresql` | volume `hu-mongodata` at `/data/db` |
| Settings | `shared_buffers=128MB`, `max_connections=200`, `work_mem=4MB`, `synchronous_commit=off` with `fsync=on`, `shared_preload_libraries=pg_stat_statements`, initdb's builtin `C.UTF-8` locale (text sorts by bytes, as the SQL course shows) | the one-node replica set `rs0` (its member host is `mongo:27017`), `--auth`, a key file, `--noscripting` (no `$where`, no server-side JavaScript), `--wiredTigerCacheSizeGB 0.25` |
| Limits | 768 MiB with no swap, 1 CPU, OOM score -500 (learner processes die first) | 1 GiB with no swap, 1 CPU, OOM score -500 |
| Hardening | read-only root (tmpfs `/var/run/postgresql` and `/tmp`), every capability dropped but `CHOWN`, `SETUID`, `SETGID`, `FOWNER`, and `DAC_OVERRIDE` (the entrypoint's), `no-new-privileges`, private IPC and cgroup namespaces, restart `unless-stopped` | the same, with tmpfs `/tmp` and `/data/configdb` |

- **Started on demand**: the first time a workspace, check, run, or panel
  needs one, pulling its image by digest the first time (the internet is
  needed once). A cold PostgreSQL starts in about 1 s, MongoDB (with its
  replica set) in 4 to 5 s. A hover never pulls: `databases.services.prewarm(kind)`
  starts a server only when its image is already here.
- **Stopped** 30 minutes after their last use (`HU_DB_IDLE_MS`), unless a
  workspace or job is still on the network. Their data stays in the volumes.
  Ctrl+C stops them.
- **Root secrets** (the PostgreSQL superuser's and MongoDB root's passwords,
  the replica set key) are in `HU_DATA_DIR/secrets.json` (0600). Volumes and
  containers carry the secrets' `hu.instance` label, so a server whose data
  folder is gone (and with it every workspace that used it) is replaced
  rather than left unreachable.
- **MongoDB 8 and Linux 6.19 to 7.0.13**: MongoDB 8.x refuses to start on
  these kernels (SERVER-121912, its TCMalloc and the kernel's rseq change),
  and Docker Desktop shipped kernel 7.0.12 until 4.93.0 (which moved to
  7.0.14). On such a kernel the runner runs `mongo:7.0.45` (the older
  allocator, the same replica set, supported by Mongoose 9) and logs
  `db.mongo_fallback`. Update Docker Desktop and the next start runs 8.0.34
  on the same data.
- **A verify runner** (`HU_NS=verify`) gets servers, a network, and volumes of
  its own per port (`hv-postgres-<port>`, `hv-mongo-<port>`, `hv-db-<port>`,
  `hv-pgdata-<port>`, `hv-mongodata-<port>`), removed when it stops, so tests
  never touch another runner's databases.

`/v1/health`'s `services.postgres` and `services.mongo` say `running`,
`stopped`, or `absent` for this namespace's servers. While up they hold
768 MiB and 1 GiB of the memory budget (`POSTGRES_BYTES`, `MONGO_BYTES` in
`db/services.ts`).

### Names

| What | PostgreSQL | MongoDB |
| --- | --- | --- |
| A workspace | role `ws_<id>`, databases `ws_<id>` (dev) and `ws_<id>_test` (test, when the template asks) | user `ws_<id>` (in `admin`) with `readWrite` on `ws_<id>` and `ws_<id>_test` |
| A check | role and database `ck_<id>_<6 hex>`, dropped when it ends | user and database `ck_<id>_<6 hex>` |
| A single-file test | role and database `run_<12 hex>`, dropped after the run | user and database `run_<12 hex>` |
| A template | `tpl_<course>_<template>_<checkpoint>_<hash8>`, a lesson setup's `tpl_lesson_<hash12>` | the same names |

Every name matches `^(ws|ck|run|tpl|vf)_[a-z0-9_]{1,48}$` and every password
is 32 hex characters, both checked before they reach a statement. Learner
roles are never superusers: no `COPY … TO PROGRAM`, no untrusted language, no
`pg_read_file`, no `ALTER SYSTEM`, and `temp_file_limit` (256 MB) is set on
the role where only a superuser can raise it. They also get
`statement_timeout` 30 s, `idle_in_transaction_session_timeout` 60 s, and 20
connections, and reach only the databases they own: `CONNECT` is revoked from
`PUBLIC` on theirs and on `postgres` and `template1`, and templates take no
connections. Each Mongo user also has `hu_rs_status` (`replSetGetStatus` and
`replSetGetConfig`), so `rs.status()` works from a workspace.

### What a workspace gets

The workspace lane calls these from its start, reset, check, and delete
paths (`main.ts` makes one `Databases` and passes it in `ApiDeps.databases`):

```ts
import type { Databases, ServiceSpec, TemplateRef } from "./db/index.ts";

// Start, when template.json has `services`: the first call makes the role and
// databases (building the template database once per hash); later calls
// answer at once. Put `env` in the container's Env and `network` in its
// NetworkMode (standardProfile's `network`), so `db` and `mongo` resolve.
const { env, network } = await databases.attach(id, ref, services);

// POST …/reset with scope "db" or "everything" (and restart tasks that
// hold connections when template.json says restartOnReset).
const { databases: reset, ms } = await databases.resetWorkspace(id, "all"); // or "dev", "test"

// A check: a fresh clone of the template (never of the learner's database),
// or an empty database for suites with "db": "empty". Drop it when done.
const ck = await databases.checkDatabase(id, suite.db);
try { /* the check's job gets ck.env on ck.network */ } finally { await ck.drop(); }

await databases.dropWorkspace(id);           // DELETE /v1/workspaces/:id
databases.touch(id);                         // activity, for the parking clock
databases.workspaceEnv(id);                  // the same { env, network } without making anything
databases.onEvent((id, event) => { /* forward on the events socket */ });
```

The events are the architecture's (§3.3): `{ "t": "limit", "kind": "quota", "message": "…" }`
from the size watch, and `{ "t": "db", "state": "reset" }` after a reset.

`ref` names the template database: `{ course, template, checkpoint?, hash? }`
(`hash` is the template's own hash, for builds that depend on more than their
SQL). `services` is template.json's `services` with the content Next resolves
from the template's `db/` folder:

```json
{
  "postgres": {
    "databases": ["dev", "test"],
    "sql": [{ "name": "db/schema.sql", "text": "CREATE TABLE …" }, { "name": "db/seed.sql", "text": "INSERT …" }],
    "testSql": [{ "name": "db/schema.sql", "text": "CREATE TABLE …" }],
    "empty": false
  },
  "mongo": {
    "databases": ["dev", "test"],
    "documents": "{\"recipes\": [{\"_id\": {\"$oid\": \"6650c1f0a1b2c3d4e5f60718\"}, \"title\": \"Pancakes\"}], \"$indexes\": {\"recipes\": [{\"key\": {\"title\": 1}, \"unique\": true}]}}",
    "testDocuments": "{}"
  }
}
```

- `sql` runs in order (schema, seed, then migrations) as the template's
  builder role. `testSql` builds the test twin (schema only, no seed), and
  without it the test database clones the dev template. `empty` starts from
  an empty database. A template built by a command (template.json's
  `services.postgres.build`, like `npm run db:build`) passes a `Builder` as
  `attach`'s fourth argument: it runs the command in a job from the
  template's image with the `env` (`DATABASE_URL` and the rest) and `network`
  it is given.
- `documents` is Extended JSON text, one array of documents per collection
  plus `$indexes`. The test database starts empty unless `testDocuments` is
  given.

The variables a workspace's container gets (a check's and a run's are the same,
pointing at their own databases):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgres://ws_<id>:<password>@db:5432/ws_<id>` |
| `TEST_DATABASE_URL` | the same for `ws_<id>_test`, when the template has a test database |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | so `psql` in the terminal needs no arguments |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | `jdbc:postgresql://db:5432/ws_<id>` and the role, for Spring Boot |
| `MONGODB_URI` | `mongodb://ws_<id>:<password>@mongo:27017/ws_<id>?replicaSet=rs0&authSource=admin` |
| `TEST_MONGODB_URI` | the same for `ws_<id>_test` |

**Template databases** are built once per hash: an empty database owned by a
builder role of its own (not a superuser) runs the template's SQL (or
build), then the database goes to the superuser, everything in it to
`pg_database_owner`, `IS_TEMPLATE true ALLOW_CONNECTIONS false`, and the
builder role is dropped. In each clone the clone's owner owns every object
through `pg_database_owner`, so a clone is one `CREATE DATABASE … TEMPLATE`
with no per-clone `REASSIGN` (and no reconnect): about 12 ms. A content change
makes a new hash, so old workspaces keep their data while their next reset
uses the new template.

**Resets** close new connections, end open ones, set the database aside under
another name, clone a fresh one, and drop the old one two seconds later, off
the clock: 17 to 40 ms for PostgreSQL on a busy laptop (the tests assert a
median under 50 ms), 0.1 to 0.3 s for MongoDB, which has no clone and copies
collections, indexes, and views. A reset opens a database the size watch
closed.

**The size watch** reads `pg_database_size` of running workspaces' databases
every 30 s (`HU_DB_SIZE_POLL_MS`): a `limit` event (kind `quota`) at 512 MB
(`HU_DB_SIZE_WARN_MB`), and at 1 GB (`HU_DB_SIZE_LIMIT_MB`) `CONNECT` is
revoked, connections are ended, and a second `limit` event asks the
workspace lane to stop the server task. Running workspaces are the
containers labeled `hu.kind=workspace` in this namespace.

**Parking**: a workspace's databases unused for 30 days (`HU_DB_PARK_DAYS`)
are dumped (`pg_dump -Fc` as the workspace's own role, `mongodump`) into
`HU_DATA_DIR/db/parked/<id>/` and dropped. The next `attach`, query, or
reset restores them (`pg_restore` as the role). Checked hourly.

**Leftovers**: when a server comes up, the `ck_`, `run_`, and set-aside
databases, half-built templates, and their roles and users that a crash left
behind are dropped.

### Routes

The Database panel's routes, plus a database reset and a summary. They need
the token like every route, answer **409** `no_database` for a workspace that
has none yet ("Run it once to create it"), and work whether the workspace
runs or not.

#### `GET /v1/workspaces/:id/db`

`{ "postgres": { "databases": ["ws_<id>", "ws_<id>_test"], "template": "tpl_…" }, "mongo": { … }, "parked": false, "blocked": [], "services": { "postgres": "running", "mongo": "absent" } }`.

#### `GET /v1/workspaces/:id/db/schema?engine=postgres|mongo&database=dev|test`

PostgreSQL (the default when the workspace has both), read as the
workspace's role: every table, view, and materialized view outside the
system schemas, in the shape `components/compiler/sql-database.tsx` lists
(`TableInfo`), plus its schema. Row counts are exact up to 100,000 rows and
estimates past that.

```json
{
  "engine": "postgres", "database": "ws_wk3j6q2m7xa", "sizeBytes": 8058559,
  "tables": [
    { "schema": "public", "name": "tasks", "kind": "table", "rows": 3,
      "columns": [{ "name": "id", "type": "integer", "nullable": false, "key": true }, { "name": "title", "type": "text", "nullable": false, "key": false }] }
  ]
}
```

MongoDB: `{ "engine": "mongo", "database", "sizeBytes", "collections": [{ "name", "type": "collection" | "view", "count", "indexes": [{ "name", "key", "unique" }] }] }`.

#### `POST /v1/workspaces/:id/db/query`

`{ "sql": "…", "database"?: "dev" | "test" }` runs the SQL through `psql` as
the workspace's role in its client container (below), statement by statement
up to the first error, 10 s at most, and answers each statement's result the
way the SQL page shows them (`components/compiler/sql-results.tsx`), with the
last one up front:

```json
{
  "engine": "postgres", "database": "ws_wk3j6q2m7xa",
  "columns": [{ "name": "id", "type": 23, "typeName": "integer" }, { "name": "title", "type": 25, "typeName": "text" }],
  "rows": [["1", "write"], ["2", null]],
  "tag": "SELECT 2",
  "error": null,
  "truncated": false,
  "results": [
    { "kind": "command", "statement": "UPDATE tasks SET done = true WHERE id = 1", "tag": "UPDATE 1" },
    { "kind": "rows", "statement": "SELECT id, title FROM tasks", "columns": […], "rows": […], "tag": "SELECT 2", "truncated": false }
  ],
  "ms": 28
}
```

- Values are psql's text, `null` for NULL (apart from the empty string).
  `type` is the PostgreSQL type id (numbers right-align), `typeName` as
  `format_type` writes it. At most 500 rows per result (`truncated: true`
  past that).
- `error` is `{ message, statement }` for the statement that failed (the
  results before it are kept), or a timeout. psql meta-commands (`\dt`,
  `\d tasks`) run as written, so the panel has psql's power and no more: it
  runs as the learner, in a container that holds nothing else.

`{ "collection": "recipes", "filter"?: { … }, "limit"?: 50, "database"?: "dev" | "test" }`
runs `find(filter).limit(limit)` (at most 500, 10 s) on a connection logged in
as the workspace's user. The filter is Extended JSON (`{"_id": {"$oid": "…"}}`):

```json
{
  "engine": "mongo", "database": "ws_wk3j6q2m7xa", "collection": "recipes",
  "columns": [{ "name": "_id" }, { "name": "title" }, { "name": "servings" }],
  "rows": [["ObjectId(\"6650c1f0a1b2c3d4e5f60718\")", "Pancakes", "4"]],
  "documents": [{ "_id": { "$oid": "6650c1f0a1b2c3d4e5f60718" }, "title": "Pancakes", "servings": { "$numberInt": "4" } }],
  "relaxed": [{ "_id": "ObjectId(\"6650c1f0a1b2c3d4e5f60718\")", "title": "Pancakes", "servings": 4 }],
  "tag": "1 document", "error": null, "truncated": false, "ms": 20
}
```

`columns` are the top-level fields in the order they first appear (at most
50), `rows` one per document as text, `documents` canonical Extended JSON for
a document view, `relaxed` the same documents with plain numbers. A query
error is an answer with `error` set, not a failed request.

#### `POST /v1/workspaces/:id/db/reset`

`{ "database"?: "dev" | "test" | "all" }` → `{ "databases": ["ws_<id>", "mongo:ws_<id>"], "ms": 18.2 }`.
The same as `databases.resetWorkspace`, for the IDE's "Reset database" until
`POST …/reset` with scope `db` calls it.

| Status | `error` | When |
| --- | --- | --- |
| 409 | `no_database` | The workspace has no database (of that engine, or no test database) |
| 409 | `db_blocked` | The size watch closed this database. A reset opens it |
| 502 | `db_error` | The server answered with an error the runner didn't expect |
| 503 | `image_missing`, `db_failed`, `docker_unavailable` | The image couldn't be downloaded, the server didn't start, or Docker is off |

### Single-file runs with a database

`POST /v1/run` takes the lesson's `setup` (architecture §6.3 and §6.4, the
"single with a database" format) on recipes in `DB_RECIPES`
(`schemas.ts`: `typescript` today, and the `express`, `fastapi`, `go`, and
`spring` recipes join as they land):

```json
{
  "recipe": "typescript",
  "files": [{ "name": "main.ts", "content": "…" }],
  "setup": { "postgres": "CREATE TABLE recipes (id serial PRIMARY KEY, title text);\nINSERT INTO recipes (title) VALUES ('Pancakes');" },
  "tests": [{ "output": "…" }, { "sql": "INSERT INTO recipes (title) VALUES ('extra');", "output": "…" }]
}
```

- `setup` is SQL (or `{ "postgres": … }`), built once into `tpl_lesson_<hash12>`
  by its own builder role, or `{ "mongo": { "<collection>": [EJSON documents], "$indexes": { … } } }`.
- Every test (and a Run) gets its own fresh database: `run_<nonce>` cloned
  from the template, with the test's `sql` applied (as the run's role) or
  its `seed` documents loaded, before the program starts. The job joins the
  database network, gets `DATABASE_URL` (and the rest above) or
  `MONGODB_URI`, and the databases and roles are dropped when the run ends.
- A test's `sql` or `seed` needs `setup` (**400** otherwise).

### Client containers

Whatever a learner or a template wrote runs as their own role in a client
container from the PostgreSQL image (`hu-dbtool-<hex>`, labeled as a job):
the panel's SQL and schema, a template's SQL, a test's SQL, and the dumps
that park a database. It runs as uid 70 with every capability dropped,
`no-new-privileges`, a read-only root, 256 MiB, 64 processes, on the database
network only, holding one role's password and nothing else. One per role,
kept a minute after its last use (a warm query takes about 25 ms) and
removed after, at most four at once. MongoDB needs none: documents are data
the fixed helpers insert, and panel queries run on a connection logged in as
the workspace's user.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `HU_DB_IDLE_MS` | `1800000` | Stop a server this long after its last use (30 minutes) |
| `HU_DB_SIZE_WARN_MB`, `HU_DB_SIZE_LIMIT_MB` | `512`, `1024` | The size watch's warning, and the size that closes a database |
| `HU_DB_SIZE_POLL_MS` | `30000` | How often the size watch reads sizes |
| `HU_DB_PARK_DAYS` | `30` | Park a workspace's databases after this many days unused |
| `HU_DB_TEST_PORT` | `3423` | The port in the names `db.integration.test.ts` uses |

On disk: `HU_DATA_DIR/secrets.json` (the root secrets, 0600),
`HU_DATA_DIR/db/state.json` (each workspace's roles, passwords, and
templates, 0600), and `HU_DATA_DIR/db/parked/<id>/` (parked dumps).

### Where it differs from the architecture

- **Template ownership.** §4.5 builds templates as one `hu_template` role and
  runs `REASSIGN OWNED BY hu_template TO ws_<id>` in each clone. `REASSIGN
  OWNED` also moves the databases a role owns, so the first workspace cloned
  would own every template database (verified on 18.6), could open it to
  connections, and change what every later clone, reset, and check starts
  from. Each template has a builder role of its own instead, and finished
  templates belong to the superuser with their objects owned by
  `pg_database_owner`.
- **The Database panel** runs in a client container from the PostgreSQL
  image (or, for MongoDB, on a connection logged in as the workspace's user)
  rather than inside the workspace's container, so it works whether the
  workspace runs or not and whatever its image, with the same role and the
  same power.
- **Mongo setup documents** load through the fixed helpers as data rather
  than with `mongosh --file` in the run's container, so a recipe's image needs
  no mongosh.
- **MongoDB 7.0.45** stands in for 8.0.34 on the kernels 8.x refuses (above).
- **State** lives in `HU_DATA_DIR/db/` (the roles and passwords in
  `state.json`, parked dumps in `parked/<id>/`) rather than in each
  workspace's `meta.json` and `db.dump`, so dropping a workspace's folder
  never loses track of its databases.

### Source files

```
db/index.ts       Databases: workspaces, templates, checks, runs, the panel, the size watch, parking
db/services.ts    the two servers: images, network, volumes, hardening, start, idle stop, secrets
db/postgres.ts    the admin psql session and the fixed SQL in db/sql/*.sql
db/mongo.ts       the admin mongosh session and its fixed helpers
db/clients.ts     client containers, where learner and template SQL runs as its own role
db/panel.ts       the panel's psql script, how its output is read, and the schema query
db/routes.ts      GET and POST /v1/workspaces/:id/db/*
db/names.ts       every role, database, container, network, and volume name, and the checks on them
db/exec.ts        docker exec: one command, or a long-lived shell
db/sql/*.sql      the fixed SQL
```

`runner/db/db.test.ts` tests names, the fixed SQL, the panel's script and
output reading, and the schemas without Docker. `runner/db/db.integration.test.ts`
runs real servers in the verify namespace: hardening, resets under 50 ms, a
check that never sees learner rows, a Mongo transaction (`rs.status().members.length`
is 1), two workspaces that can't read each other's data, S8's escalations,
template ownership, parking, the size watch, a single-file TypeScript run
with a fresh database per test, Mongo setups, and the routes' shapes.

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

## Files

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
log.ts           ~/.hack-university/logs/runner.log
verify.ts        the library the verifiers import (verify namespace)
bench.ts         times the job path end to end against the budgets
```

## Tests

- `npm run runner:test` runs the unit tests (tokens, tickets, the Host and
  Origin rules, schemas, recipe commands, type-test layout, profiles and
  limits, labels, tar from good and malformed bytes, the exec stream, the job
  pool, image hashes and builds, and the REST and WebSocket front door on a
  real server), and `runner/integration.test.ts`, which runs real jobs (test
  isolation, read-back, outside kills) and is skipped when Docker is off or
  the images aren't built.
- `npm run security:verify` runs S1 (hardening), S2 (egress), S4 (limits), S9
  (runner auth), S14 (cleanup after `kill -9`, and a second runner on a taken
  port), and S16 (Piston) against real containers and a real runner in the
  verify namespace.
- `node runner/bench.ts` times Run and Check against a running runner.
- Type-check with `npx tsc -p runner`.
