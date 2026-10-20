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

"Prepare this course": builds the course's image in the background (and its
parent first, so `express` builds `hu/node` before `hu/web` when it's missing)
and answers **202** `{ "stack": "express", "images": { "hu/web": "building" } }`.
A stack is any course in `runner/stacks.ts`: typescript, bash, web, react,
nextjs, express, fastapi, spring, go-api. Anything else answers 404. Progress
shows in `/v1/health` (and as `image` events from P1).

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
rebuild happens only when they change. A stack image's tag also covers its
parent's tag and its courses' template lockfiles, which it bakes into its
offline cache. The previous tag is kept and older ones pruned. Bases are
pinned by digest and every download by SHA-256. `docker/README.md` lists what
each image holds, where, and what a workspace must mount for it.

| Image | From | Adds | Size | First build |
| --- | --- | --- | --- | --- |
| `hu/node` | `node:26.12.0-trixie-slim` | npm 12.2.0, TypeScript 7.0.2 (the native `tsc`), `@types/node` 26.6.5, zod 4.6.7, bash, git, curl, jq, less, nano, procps, socat, tree | 0.62 GB | about 1 min |
| `hu/bash` | `debian:trixie-slim` (13.7) | Bash 5.3 patch 20 and gawk 5.4.1 built from source, the static jq 1.8.2 and ShellCheck 0.11.0, bats-core 1.14.0 with bats-support, bats-assert, and bats-file, faketime, cron, sudo, git, sqlite3, man pages, socat, python3 | 0.55 GB | about 2 min |
| `hu/web` | `hu/node` | An offline npm cache for the web, React, Next.js, and Express templates, the express and nextjs script environments, psql 18, mongosh 2.13.0 | 1.77 GB | about 1.5 min |
| `hu/python` | `python:3.14.8-slim-trixie` | uv 0.13.1 with an offline cache of the FastAPI stack (FastAPI 0.148.0), the fastapi script venv, the `hu_check` pytest plugin, psql 18 | 0.81 GB | about 1 min |
| `hu/java` | `eclipse-temurin:25-jdk` | Maven 3.10.0, a read-only repository for Spring Boot 4.1.1, the wrapper offline, the spring recipe's jar profiles, psql 18 | 1.12 GB | about 1.5 min |
| `hu/go` | `golang:1.27.2-trixie` | A file module proxy, the seed of the shared `hu-go-build` caches, sqlc, goose, gotestsum, golangci-lint, air, psql 18 | 2.24 GB | about 3 min |

Every image runs as `learner` (uid 1000), has `hu-exec` and `hu-init` in
`/opt/hu/bin`, and fails its own build if a pinned version drifts or, with no
network, an offline install or build stops working. `npm run images` builds
the core images (`hu/node`, `hu/bash`) when missing, `npm run images --
--stacks=express` (or `--stacks=all`) adds courses' images,
`npm run images -- bash --force` rebuilds one, and `npm run images:status`
lists tags, sizes, and the kept previous tags.

`runner/stacks.ts` maps each course in `content/courses.json` that runs here
to its image, its default dev, test, and install commands, its dependencies,
the volumes it shares, and its single-file environment. `POST
/v1/stacks/:stack/prepare` and `--stacks` build from it.

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
stacks.ts        each course's image, commands, dependencies, and shared volumes
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
