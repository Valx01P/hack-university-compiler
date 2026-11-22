# hu-runner

The workspace runner: the one local service that talks to Docker. It runs
TypeScript and Bash in hardened, throwaway containers (jobs), and keeps the
folders on this computer that the compiler pages and the playground show:
their files, their file events, and their terminals (shells on this
computer, kept in tmux). It is TypeScript run directly by Node's type
stripping (Node 24.12 or newer), with no build step, and listens on
`127.0.0.1:3100`.

```
browser ──▶ Next.js /api/* ──(bearer token)──▶ hu-runner 127.0.0.1:3100 ──(Docker API)──▶ hu-job-<uuid>
                                                hu-runner ──▶ HU_DATA_DIR/workspaces/<id>/files, and a shell there (node-pty, tmux)
browser ──(ws://127.0.0.1:3100, ticket first)──▶ hu-runner (file events, terminals)
```

- `npm run up` starts it beside the app and restarts it if it crashes.
  `npm run dev` runs it under `node --watch` beside `next dev`.
  `npm run runner` runs it alone, for verifiers and debugging.
- Its own dependencies live in `runner/package.json` (dockerode 5.0.1,
  node-pty 1.1.0, ws 8.22.0, zod 4.6.7, and xterm's headless terminal, pinned
  exactly), installed with `--ignore-scripts` so no native code is built.
  `npm run up` installs them.
- It starts with Docker off: `/v1/health` says `"down"`, a run answers 503
  `docker_unavailable` ("Start Docker to run this."), and it picks Docker up
  within 5 seconds of it starting. The folders and their terminals never
  need Docker.
- It takes its port before it touches Docker, so a second runner started on a
  port that's taken (`npm run runner` beside `npm run up`) exits at once and
  leaves the first one's jobs alone. A request that arrives while it first
  looks at Docker waits for that look (a moment), so the first `/v1/health`
  is already right.

Design: `architecture.md` §2.6, §3.2, §3.3, §3.5, §4.1, §4.2, §4.3, §11 in
the expansion plan. This file is the contract the app codes against.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `HU_RUNNER_PORT` | `3100` | Port, on `127.0.0.1` only |
| `HU_RUNNER_TOKEN` | the token file | The bearer token. `npm run up` writes a fresh one to `~/.hack-university/runner-token` (0600) every run and passes it to both the runner and Next.js |
| `PORT` | `3000` | The app's port. WebSockets accept only the Origins `http://localhost:<PORT>` and `http://127.0.0.1:<PORT>` |
| `HU_DATA_DIR` | `~/.hack-university` | Token, logs (`logs/runner.log`, rolled at 10 MB), and the workspaces' folders |
| `HU_NS` | `live` | `verify` for the verifiers: `hv-` names and `hu.ns=verify` labels, so they never touch a learner's objects |
| `HU_JOB_SLOTS` | `4` | Jobs at once. The rest wait in a FIFO queue |
| `DOCKER_HOST`, `DOCKER_CONTEXT` | the active context | Which Docker, found the way the docker CLI finds it (Docker Desktop, Colima, OrbStack) |
| `HU_TICKET_TTL_MS`, `HU_WS_HELLO_MS`, `HU_POLL_MS` | 30000, 5000, 5000 | Ticket lifetime, the time a socket has to send its ticket, and how often Docker is checked, leftovers reaped, and old trash cleared. Tests shorten them |
| `HU_CONTENT_DIR` | `<repo>/content` | Where template layers (`workspaces/<course>/<template>/`) and `@` layers are read from |
| `HU_TERM_GRACE_MS` | `600000` | A terminal with no socket attached lives this long, so a reload reattaches (10 minutes) |
| `HU_TMUX_SOCKET` | `hack-university` | The tmux server the terminals keep their shells in (`tmux -L <it>`). Tests use their own |
| `HU_HOST_TMUX` | on | `0` turns tmux off: a shell runs straight on its pty and ends with it |

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
| 404 | `not_found` | No such route, workspace, file, or terminal |
| 405 | `method_not_allowed` | Wrong method |
| 413 | `too_large` | Body over its cap |
| 409 | `conflict` | A save whose `If-Match` no longer matches the file (the body also has the current `etag`) |
| 409 | `exists`, `not_a_file`, `too_many_terminals`, `no_terminal` | A rename, copy, or restore onto something that exists. A file route on a folder, link, or FIFO. A fifth shell. A terminal for a workspace that gets none |
| 415 | `unsupported_media_type` | Not JSON |
| 499 | `cancelled` | The caller hung up while its run was queued or running (the job is stopped) |
| 500 | `job_failed`, `internal`, `terminal_failed` | Something broke in the runner or the sandbox, or a shell couldn't start. `message` says what |
| 501 | `not_implemented` | The workspace routes on a runner started without them (its tests) |
| 503 | `docker_unavailable` | Docker is off ("Start Docker to run this."), or still waking up |
| 503 | `image_missing` | The recipe's image isn't built: the message names the `npm run add` command for its course |
| 503 | `busy` | 64 runs are already waiting for a job slot |

## Routes

### `GET /v1/health`

Docker, the images, and the jobs. Cheap: it reads state the runner keeps,
refreshed every 5 seconds.

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
  "jobs": { "running": 0, "queued": 0, "slots": 4 },
  "runner": { "version": "0.1.0", "ns": "live", "boot": "41fcc6557cda", "port": 3100, "uptimeMs": 3887 }
}
```

- `docker.state` is `ready`, `down`, or `waking` (Docker Desktop's Resource
  Saver can take a few seconds to answer). The other `docker` fields are `null`
  while it's down. `belowFloor` is true under the 7.75 GiB floor
  (`lib/docker-memory.mjs`, shared with `npm run up`).
- An image state is `ready`, `missing`, or `building`. `recipes.*.versions`
  come from the image's own `hu.versions` label, for the sandbox badge
  ("TypeScript 7.0.2 on Node 26.12.0", "Bash 5.3").

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
"kind": "term", "sid": "h1abcdefghij" }`, answers `{ "ticket": "…", "expiresAt":
1792400430000 }`: 32 random bytes, single use, valid for 30 seconds, bound to
the workspace, the socket kind, and (for a terminal) its session. Only a hash
of each ticket is kept, and tickets never appear in URLs or logs. The
workspace must exist (**404** otherwise), and a terminal ticket's `sid` must
be one of its terminals.

### Admin routes

Need `X-HU-Admin: 1` as well as the token. Next never forwards them.

| Route | Does |
| --- | --- |
| `POST /v1/admin/reconcile` | Removes job containers an earlier run of this runner left (`{ "removed": [names] }`) |
| `POST /v1/admin/gc` | One reaper pass, and prunes old image tags (`{ "removed": [...], "prunedImages": [...] }`) |
| `GET /v1/admin/images` | `{ "node": { "tag": "hu/node:…", "state": "ready" }, … }` |
| `POST /v1/admin/images` | Builds `{ "names": ["node"] }` (or every image) in the background, **202** |

## Workspaces

A workspace is a folder on this computer (`architecture.md` §4.2):
`HU_DATA_DIR/workspaces/<id>/files`, which the page's Explorer and editor
show and its terminal works in. Next.js opens one when its page mounts, and
every route below takes its id. Nothing runs in a container: opening one,
its files, and its terminals never need Docker. Every route under
`/v1/workspaces/:id/` except `PUT` answers **404** `not_found` for a
workspace that was never opened (or was deleted). One lock per workspace
serializes opening, resets, and the runner's own writes, so double clicks
and two tabs can't race.

### Ids and scopes

`lib/workspace-id.mjs` (shared by Next, the browser, the runner, and the
verifiers) names each workspace by its scope:

| Scope | Shown on | Template |
| --- | --- | --- |
| `compiler/<course>` | `/<course>`, the compiler page's Explorer and Terminal | `content/workspaces/<course>/compiler` |
| `playground` | `/playground` | `content/workspaces/playground/blank` |

The playground has no course, so `playground` stands in for one wherever a
workspace names its owner (its `course`, its template's first segment).

```js
import { workspaceId, parseScope } from "@/lib/workspace-id.mjs";
parseScope("playground");        // { kind: "playground", course: "playground" }
workspaceId("compiler/python");  // "wxkudhw5lug"
```

The id is `w` and the first 10 characters of the lowercase base32 of
SHA-256(scope), matching `^w[a-z2-7]{10}$`. The module is plain JavaScript
with its own SHA-256, so it is synchronous everywhere (the browser can name
`hu-ws-v1:<id>` before first paint).

A folder from before, whose scope is no longer one (a lesson's part, a
challenge's, a course's playground or sandbox), is left alone: the runner
never opens it, lists it, or removes it, and `npm run clean` asks the
learner about it. When Docker is up, the runner removes the containers
workspaces ran in before they were folders (`hu.kind=workspace`, by its own
namespace and data folder's labels): their files were these folders,
bind-mounted, so nothing of the learner's goes with them.

### `PUT /v1/workspaces/:id`

Next sends this after resolving content: the scope, the template, and the
layers to stack. The browser never sends it. It is idempotent: the first call
materializes the files, and later calls return the live state. The id must
be `workspaceId(scope)`.

```json
{
  "scope": "playground",
  "template": "playground/blank",
  "layers": ["base"],
  "storage": "host",
  "shell": "host",
  "hidden": ["AGENTS.md", "CLAUDE.md", ".hu"]
}
```

| Field | Meaning |
| --- | --- |
| `scope`, `template` | The workspace's scope, and `<course>/<template>` (the folder `content/workspaces/<course>/<template>/`), whose first segment must be the scope's course |
| `course` | Optional: the scope's course (`playground` for the playground), and nothing else |
| `layers` | 1 to 32 layers, copied in order. `base` is the template's `base/`. `checkpoints/<cp>` and `examples/<id>` are the template's `<that folder>/overlay/`, then its `delete.txt`. `@<path>` is any folder under `content/`: its `overlay/` when it has one, else the folder itself without its top-level `delete.txt`, `transcript.json`, and `extends`, then its `delete.txt` |
| `storage` | Optional, and only `host` |
| `shell` | `host` for a terminal: a shell on this computer in the workspace's files folder. Only `compiler/<course>` and `playground` get one, whatever else asks (`shellPlace` in `workspaces.ts`). Without it, the workspace has no terminal (**409** `no_terminal`) |
| `hidden` | Paths that are the app's, not the learner's (the notes for AI tools): when the template changes one the learner left as it was, the learner's copy follows the template |
| `readonly` | Kept in `meta.json` |

**200** `{ "id", "status", "templateHash", "created", "updated", "tree", "removed" }`:

- `status` is always `files`.
- `created` is true when this call made the files.
- `templateHash` is 12 hex characters over the materialized manifest (below).
  When content ships a changed template, the next `PUT` rebuilds the original
  and `updated` lists every path whose original changed. The files the
  learner has are never touched, except a `hidden` note still as the old
  template had it, which takes the new one (and goes when the template drops
  it).
- `tree` is the whole tree in the shape of `GET …/tree` (heavy folders such as
  `node_modules` are listed but not opened), and `removed` lists the original
  paths that are gone.

### `GET /v1/workspaces` and `GET`, `DELETE /v1/workspaces/:id`

`GET /v1/workspaces` lists every workspace:
`{ "workspaces": [{ id, scope, course, template, status, lastActiveAt, sizeBytes }] }`
(`sizeBytes` is what `du` counts for the workspace's folder, trash included).

`GET /v1/workspaces/:id` answers
`{ id, scope, course, template, templateHash, status, storage, createdAt, lastActiveAt, terminals: [terminal], changes }`,
so a reload finds the shells that kept running.

`DELETE /v1/workspaces/:id` ends its shells (and their tmux session) and
removes its files. **204**.

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
| `POST …/reset` | `{ "scope": "file" \| "dir", "path", "dryRun"? }` | `{ "restored": [path], "removed": [path] }`: the file, or everything in the folder, back to the original, what the original doesn't have removed (heavy folders and `.git` aside). `dryRun` answers what would change without changing it |

**`entry`** (tree rows, and the third item of `fs` events):

```json
{ "name": "a.ts", "path": "src/a.ts", "type": "file", "size": 312, "mtimeMs": 1760864400000, "mode": 420, "state": "modified" }
```

- `type`: `file`, `dir`, `symlink`, `fifo`, `socket`, `mount`, or `other`.
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

The runner's own writes (a save, the fs operations, a reset, a restore)
happen under the workspace lock, refusing any path through a symbolic link.
Reads always happen with `O_NOFOLLOW_ANY` and only open regular files. A
terminal there, or a tool in it, changes the folder like any shell would, and
the watcher reports it (below).

**The manifest** (`meta.json`) maps every original path to its type, mode,
size, and SHA-256 (links to their target). It drives the `M` and `U` marks,
the Removed group, every reset, and `GET …/original`. `templateHash` is the
first 12 hex characters of SHA-256 over its lines,
`<path>\0<type>\0<mode octal>\0<sha256 or target>\n`, sorted by path.

### Terminals

| Route | Body | Answers |
| --- | --- | --- |
| `POST …/terminals` | `{ "cols", "rows", "cwd"? }` | `{ "sid" }`. At most 4 shells per workspace (**409** `too_many_terminals`), and none for a workspace opened without `"shell": "host"` (**409** `no_terminal`) |
| `GET …/terminals` | | `[{ "sid", "kind": "shell", "cols", "rows", "exited", "createdAt" }]`, so a reload finds its sessions |
| `DELETE …/terminals/:sid` | | **204**. Ends the shell, and its tmux session |

A shell is the user's login shell on this computer (`$SHELL -l`, PowerShell
on Windows) through a pseudo-terminal (node-pty), in the workspace's
`files/` folder (or `cwd` under it), with `TERM=xterm-256color` and
`COLORTERM=truecolor`. Everything it prints is mirrored into
`@xterm/headless`, so a reattach within 10 minutes of the last socket closing
(`HU_TERM_GRACE_MS`) replays the screen and 5,000 lines of scrollback.
Connect with `ws://127.0.0.1:3100/v1/ws/term/<sid>` (below). It starts when
the first socket attaches, at that terminal's size (its hello's `cols` and
`rows`), so the first prompt is drawn for the width it shows at. A line feed
that would leave a blank first line on an empty screen (the cursor at the top, nothing on it or below,
on the normal screen) is dropped, so a prompt that starts with a blank line
(Starship's `add_newline`) starts on the first line, at the start, after
`clear`, and after a resize redraw alike. It gets the runner's
environment minus the app's (`HU_*`, `npm_*`, `PORT`, `NODE_OPTIONS`), so
nothing in it can call the runner as the app. It has no sandbox and no limits,
on purpose: the user's own tools and logins work there. Ending it hangs up
every process on its terminal, its jobs included (found with `ps`, since
macOS's `pkill` can't match a session, nor, it turns out, a terminal), then
kills what's left (`pty.ts`), and the runner ends every host shell when it
shuts down. Its session id starts with `h`. Installs skip packages' scripts,
so the runner makes node-pty's prebuilt `spawn-helper` executable itself the
first time.

With tmux on the computer, the shell is kept in it, so it outlives the page
and the runner (`host-tmux.ts`): the pty runs a tmux client attached to the
workspace's session (`hu-<id>`, made the first time, in the files folder), on
a tmux server of the app's own (`tmux -L hack-university`, `HU_TMUX_SOCKET`
for the tests) with its own config (`tmux.conf`: no status bar, no prefix
key, drawn on the normal screen so the browser terminal's scrollback works,
24-bit color). Ending the runner's session, at its grace period, a
reattach, or shutdown, ends only that client: the next terminal attaches to
the same shell, its screen as it was. Closing the terminal (`DELETE`),
removing the workspace, or the shell exiting ends the tmux session. tmux
runs `host-shell.ts`, which starts the login shell on a pty of its own and
drops that blank first line inside (`blank-top.ts`, shared), since tmux
draws the screen itself, and tells Claude Code that 24-bit color passes
through (`CLAUDE_CODE_TMUX_TRUECOLOR`, without which it draws in 256 colors
in tmux). `HU_HOST_TMUX=0` turns tmux off, and without it (Windows, or not
installed) a shell runs straight on the pty.

A shell never gets an AI agent's session markers (Claude Code's
`CLAUDECODE`, session id, messaging socket and token, effort, and "child
session" flag, `withoutAgentSession` in `pty.ts`): with the app started from
inside a Claude Code session, the one you run in the Terminal would take
itself for its child and save no transcript. Your own settings
(`ANTHROPIC_*`, `CLAUDE_CODE_USE_BEDROCK` and the like) stay.

## WebSockets

`ws://127.0.0.1:3100/v1/ws/events` (one per open workspace) and
`ws://127.0.0.1:3100/v1/ws/term/<sid>` (one per terminal). The browser uses
`127.0.0.1`, never `localhost`, so cookies a dev server on `localhost` sets
never ride along. No cookie is ever used for authentication.

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
| Client to runner | `{"t":"hb"}` now and then while a tab shows the workspace |
| Runner to client | `{"t":"ready","workspace":"wk3j6q2m7xa","seq":42,"resync":false}`, then a `status`. `resync: true` means the batches after `since` are gone (the runner keeps the last 500): fetch the tree again. Otherwise the batches after `since` follow, in order |
| Runner to client | `{"t":"status","status":"files","detail":null}` |
| Runner to client | `{"t":"fs","seq":43,"events":[["add","src/a.ts",entry],["change","package.json",entry],["unlink","tmp/x"],["addDir","src/dto",entry],["unlinkDir","tmp"]]}`, batched every 50 ms, from FSEvents on the files folder (`watch.ts`). `entry` is the tree row of the path. Heavy folders report only themselves, never what's inside. A folder that arrives whole (a `mv` into the workspace, `git checkout`) reports every path in it |
| Runner to client | `{"t":"terminal","sid":"…","state":"exited","code":0}` when a shell ends |

Several tabs may hold events sockets for one workspace, and each gets every
message.

### The terminal socket

| Direction | Frame | Message |
| --- | --- | --- |
| Client to runner | text | `{"t":"hello","ticket":"…","cols":120,"rows":32}`, first, so the first prompt wraps right |
| Runner to client | text | `{"t":"ready","sid":"…","cwd":"…","shell":"zsh","kind":"shell","readonly":false,"tmux":true}`, then `{"t":"replay","data":"…"}` with the serialized screen and up to 5,000 lines of scrollback when there is any (always on a reattach): write it into the terminal before any output |
| Both | binary | Keystrokes in, output out, as raw bytes |
| Client to runner | text | `{"t":"resize","cols":132,"rows":30}` |
| Client to runner | text | `{"t":"ack","bytes":131072}`: flow control, the output bytes the terminal has written since the previous ack (from `term.write(data, callback)`). The runner pauses the shell's output above 100,000 unacknowledged bytes and resumes below 10,000 (the xterm.js guide's numbers), so Ctrl+C answers at once during `yes`. Only the writer's acks count, and a read-only socket that falls 8 MB behind is closed (4408) |
| Client to runner | text | `{"t":"signal","sig":"INT"}` from a Stop button: Ctrl+C at the prompt |
| Client to runner | text | `{"t":"takeover"}` |
| Runner to client | text | `{"t":"mode","readonly":true}` when another tab takes over, and `false` when this one does |
| Runner to client | text | `{"t":"exit","code":0,"signal":null}` when the shell ends |
| Both | text | `{"t":"ping"}`, answered with `{"t":"pong"}` |

Each terminal has one writer: the first socket to attach, or the last one to
send `takeover`. Every other socket is read-only (keystrokes, resizes, and
signals are ignored) until it takes over. Closing the socket keeps the shell
for 10 minutes (in tmux, for good), so a reload reattaches with the same
`sid` and a fresh ticket.

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
CPU on average. `/tmp` is `noexec`. `verify-security` holds the profile to S1
and S2.

Labels (§5.3): `hu.managed=1`, `hu.kind=job`, `hu.ns`, `hu.runner=<boot id>`,
`hu.port`, `hu.recipe`, and `hu.expires`. At startup, once it holds its port,
the runner removes jobs its port left behind (a `kill -9` mid-run), and every
5 seconds it removes any job in its namespace 10 s past `hu.expires`. It acts
on nothing without its labels. On Ctrl+C it removes its own jobs before
exiting.

Files go in with `tar -x` and come back as a listing (what is at each path)
followed by each regular file's first bytes in base64, one line per file, so
nothing read from the container is trusted for a length. `tar.ts` also packs
and reads the trash's archives, and stops at the first header that doesn't
add up.

## On disk

```
HU_DATA_DIR/                       ~/.hack-university by default
  runner-token                     0600
  workspaces/<id>/
    meta.json                      scope, course, template, layers, templateHash, manifest, config, times
    original/                      the materialized layers (APFS clones), the source of resets and GET …/original
    files/                         the learner's files, which the terminal works in
    trash/<token>.tar, .json       deleted entries, kept 24 hours
  logs/runner.log
```

`original/` and `files/` are made with `/bin/cp -c -R -P` (argv, no shell):
copy-on-write clones on APFS that keep links as links, falling back to a
plain recursive copy on other file systems.

## Images

`docker/<name>/Dockerfile`, built with the `docker/` folder as context and
tagged `hu/<name>:<sha12>` of the Dockerfile and every file it copies, so a
rebuild happens only when they change. The previous tag is kept and older
ones pruned. Bases are pinned by digest and every download by SHA-256.
`docker/README.md` lists what each image holds.

| Image | From | Adds | Size | First build |
| --- | --- | --- | --- | --- |
| `hu/node` | `node:26.12.0-trixie-slim` | npm 12.2.0, TypeScript 7.0.2 (the native `tsc`), `@types/node` 26.6.5, zod 4.6.7, bash, git, curl, jq, less, nano, procps, tree | 0.62 GB | about 1 min |
| `hu/bash` | `debian:trixie-slim` (13.7) | Bash 5.3 patch 20 and gawk 5.4.1 built from source, the static jq 1.8.2 and ShellCheck 0.11.0, bats-core 1.14.0 with bats-support, bats-assert, and bats-file, faketime, cron, sudo, git, sqlite3, man pages, python3 | 0.55 GB | about 2 min |

Every image runs as `learner` (uid 1000), has `hu-exec` in `/opt/hu/bin`, and
fails its own build if a pinned version drifts. `npm run images` builds both
when missing, `npm run images -- bash --force` rebuilds one, and
`npm run images:status` lists tags, sizes, and the kept previous tags.

## Source files

```
main.ts          token, Docker, reconcile, the reaper, listen
config.ts        environment variables
auth.ts          the token, tickets, and the Host and Origin rules
http.ts          the REST routes, body caps, and errors
ws.ts            the WebSocket upgrade, the ticket handshake, and the events and terminal sockets
schemas.ts       zod schemas for every body
docker.ts        finding Docker, the connection, labels, and namespaces
images.ts        content-hash tags, builds, pruning (and npm run images)
jobs.ts          the job primitive and the job pool
profiles.ts      the job profile and its limits (§11.2, §11.3)
recipes/         typescript and bash
reaper.ts        reconcile at startup, and the reaper
tar.ts           just enough tar to load files in, and to read archives safely
components.ts    the npm run add command a missing image's message names
workspaces.ts    workspaces: identity, locks, materializing, files, resets, trash, terminals, hidden notes
workspace-routes.ts  the /v1/workspaces routes
storage/host.ts  host files: O_NOFOLLOW_ANY reads, safe host writes, cp -c clones, the manifest
watch.ts         FSEvents on the files folder, batched into fs events
events.ts        each workspace's event hub, with the fs replay buffer
terminals.ts     shells on this computer: the pty, the headless mirror, replay, flow control
pty.ts           node-pty, the end of a shell and its jobs, an agent's session markers left out
host-tmux.ts     the app's own tmux server: sessions, clients, and tmux.conf
host-shell.ts    the shell tmux runs: a pty of its own, and no blank first line
blank-top.ts     the blank first line a prompt would leave on an empty screen
test-fixtures/   content for the workspace tests: a compiler template and the playground's
log.ts           ~/.hack-university/logs/runner.log
verify.ts        the library the verifiers import (verify namespace)
bench.ts         times the job path end to end against the budgets
```

## Tests

- `npm run runner:test` runs the unit tests (tokens, tickets, the Host and
  Origin rules, schemas, recipe commands, type-test layout, the job profile
  and limits, labels, tar from good and malformed bytes, the exec stream, the
  job pool, image hashes and builds, the REST and WebSocket front door on a
  real server, workspace ids, host path safety with links and FIFOs, host
  shells and tmux on a server of the tests' own, and where a terminal may
  run), and two suites:
  - `runner/workspaces.test.ts` opens a compiler folder and the playground
    from `runner/test-fixtures/content` in a data folder of its own, with no
    Docker and tmux off: materializing, etags, fs operations and undo, the
    marks against the original, file and folder resets, a file made outside
    arriving as an `fs` event, the hidden notes following the template, a
    folder from before left alone, terminals only where `shellPlace` allows,
    and the routes, which refuse a container's fields and the routes that ran
    in one;
  - `runner/integration.test.ts` runs real jobs against real Docker (test
    isolation, read-back, outside kills), and skips when Docker is off or the
    images aren't built.
- `npm run security:verify` runs S1 (hardening), S2 (egress), S4 (limits), S9
  (runner auth), S14 (cleanup after `kill -9`, and a second runner on a taken
  port), and S16 (Piston) against real containers and a real runner in the
  verify namespace.
- `node runner/bench.ts` times Run and Check against a running runner.
- Type-check with `npx tsc -p runner`.
