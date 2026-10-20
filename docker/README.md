# The hu/* images

Every image a course runs in, built locally by the runner from
`docker/<name>/Dockerfile` with this folder as the build context, natively
for the Mac (arm64 on Apple Silicon). Design: `architecture.md` §2.4, §4.4,
§11.2, and Appendix A in the expansion plan. Building needs the internet
once. Running never does: every image installs, builds, and tests offline,
and each one proves it while it is built (its last step runs with no network).

```sh
npm run images                         # the core images, hu/node and hu/bash, when missing
npm run images -- --stacks=express     # a course's image (and its parent)
npm run images -- --stacks=all         # every image
npm run images -- web --force          # rebuild one, even when its tag exists
npm run images:status                  # tags, states, sizes, and the kept previous tags
```

`npm run up` builds the core images, and `npm run up -- --stacks=fastapi,go-api`
(or `--stacks=all`) adds those courses' images. Otherwise a course's image
waits for its "Prepare this course" button (`POST /v1/stacks/<course>/prepare`).

## Tags

`hu/<name>:<sha12>` is the first 12 hex digits of SHA-256 over:

- Every file in the image's input folders (its own folder, `pgdg/` for the
  stack images, and `shared/` for every image but `hu/web`, which gets it
  through `hu/node`), with paths and the executable bit.
- The parent's tag, for an image built FROM another (`hu/web` on `hu/node`),
  so a new `hu/node` rebuilds `hu/web`. The parent is built first when it is
  missing, and the child's Dockerfile gets it as the `HU_BASE` build argument.
- Every template lockfile the image bakes in (below), so a new or changed
  template lockfile rebuilds its stack's image.

The build that makes a new tag prunes the image's older tags, keeping the one
before it. Bases are pinned by digest and every download by SHA-256 (or by
its lockfile's integrity hashes).

## Template lockfiles

A stack image's offline cache holds every package its courses' templates
install. `runner/images.ts` stages these files from `content/workspaces/`,
keeping their paths, and passes them to the build as the `templates` build
context (`COPY --from=templates`):

| Image | Courses | Files staged (anywhere in a template but `node_modules`, `.venv`, `target`, `.git`, `.next`, `dist`, `build`) | What the build does with each |
| --- | --- | --- | --- |
| `hu/web` | web, react, nextjs, express | `package.json`, `package-lock.json` | `npm ci --ignore-scripts` beside it, so the cache holds every tarball, then cache metadata for exactly those versions |
| `hu/python` | fastapi | `pyproject.toml`, `uv.lock`, `.python-version` | `uv sync --frozen --all-groups --no-install-project` |
| `hu/java` | spring | `pom.xml` | `mvn dependency:go-offline` |
| `hu/go` | go-api | `go.mod`, `go.sum` | `go mod download` into the module proxy |

So a template never needs a version the image lacks: committing the template
changes the image's tag, and the next "Prepare this course" bakes its
lockfile in. Templates should still pin the versions below, so every
template shares one set of packages.

## The images

Sizes are `docker images` sizes on this Mac (arm64), on 2026-10-20. A first
build is its wall time with nothing cached. A rebuild after a template change
reruns only the steps from its lockfiles on.

| Image | From | Size | First build |
| --- | --- | --- | --- |
| `hu/node` | `node:26.12.0-trixie-slim` | 0.62 GB | about 1 min |
| `hu/bash` | `debian:trixie-slim` (13.7) | 0.55 GB | about 2 min |
| `hu/web` | `hu/node` | 1.77 GB (1.15 GB on top of `hu/node`) | about 1.5 min |
| `hu/python` | `python:3.14.8-slim-trixie` | 0.81 GB | about 1 min |
| `hu/java` | `eclipse-temurin:25-jdk` (Ubuntu 26.04) | 1.12 GB | about 1.5 min |
| `hu/go` | `golang:1.27.2-trixie` | 2.24 GB | about 2 min |

Every image runs as `learner` (uid 1000, `HOME=/home/learner`, bash), sets
`HOST=0.0.0.0`, `LANG=C.UTF-8`, and `TZ=UTC`, has socat (the port bridge),
`ss` (iproute2), git, curl, jq, less, nano, procps, and tree, has `hu-exec`
and `hu-init` (and whatever else `shared/bin` holds) in `/opt/hu/bin`, and
the stack images have `psql`, `pg_dump`, and `pg_isready` from PostgreSQL 18
(the PGDG repository, key fingerprint
`B97B 0AFC AA1A 47F0 44F2 44A0 7FCC 7D46 ACCC 4CF8`, whose minor version
follows the repository: 18.6 today). Each image's `hu.versions` label feeds the sandbox
badge.

### hu/web: web, React, Next.js, Express

Node 26.12.0, npm 12.2.0, TypeScript 7.0.2 (from `hu/node`), plus:

| What | Where | Holds |
| --- | --- | --- |
| npm cache | `/opt/hu/npm-cache`, read-only, 230 MB (213 MB of tarballs) | Every package of the four sets in `web/cache/` and the two in `web/env/` and every template lockfile: 1,037 packages, 1,202 versions. Their registry metadata lists only those versions, so `npm install zod` offline picks one the cache holds |
| npm's view of it | `/tmp/npm-cache` (npm's `cache` setting) | npm rewrites a cache's index on every metadata lookup, so the `npm` and `npx` wrappers first run `hu-npm-cache`, which copies the index (17 MB) into `/tmp` and links the tarballs. `npm ci` alone would work from the read-only cache, `npm install <name>` would not |
| Express scripts | `/opt/hu/env/express` (57 MB) | `node_modules` with every runtime package of the Express course, and Express 4.22.3 as `express4`. The express recipe's tmpfs work folder is `/opt/hu/env/express/work`, so `main.ts` resolves them by walking up |
| Next.js scripts | `/opt/hu/env/nextjs` (290 MB) | next, react, react-dom, zod, drizzle-orm, `@electric-sql/pglite`, pg, jose, server-only. Work folder `/opt/hu/env/nextjs/work`. Run with `node --import /opt/hu/env/nextjs/next-resolve.mjs main.ts`: Next.js has no exports map, so plain Node finds `next/server` only through that hook |
| The sets | `/opt/hu/npm-sets/<set>/package.json` | What each set pins, for authors |
| mongosh | `/usr/local/bin/mongosh` (181 MB) | MongoDB's 2.13.0 build for Debian's OpenSSL 3 |
| npm config | `/usr/local/etc/npmrc` | `cache=/tmp/npm-cache`, `offline=true` (a missing package fails at once instead of retrying for a minute), no audit, fund, or update notices, logs in `/tmp/npm-logs` |

`NEXT_TELEMETRY_DISABLED=1` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` are set.
`hu/node`'s `/node_modules` (the TypeScript sandbox's zod and types) is
removed here, so a template can't import a package its `package.json` forgot.

Versions the sets pin (template `package.json` files pin the same, exactly):

| Course | Packages |
| --- | --- |
| all | typescript 7.0.2 (and `@typescript/typescript6` 6.0.2 where ESLint needs the API), `@types/node` 26.6.5, zod 4.6.7, vitest 5.0.5, vite 8.3.4 |
| express | express 5.3.0 (4.22.3 as `express4`), pg 8.23.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11, mongoose 9.11.2, mongodb 7.7.0, supertest 7.3.1, pino 10.4.0, pino-http 11.0.0, pino-pretty 13.2.0, helmet 8.3.0, cors 2.8.6, express-rate-limit 8.7.1, argon2 0.45.1, bcryptjs 3.0.3, jose 6.2.12, jsonwebtoken 9.0.3, express-session 1.19.0, connect-pg-simple 10.0.0, connect-mongo 6.0.0, cookie-parser 1.4.7, multer 2.4.0, ejs 7.0.2, autocannon 8.0.0, and the matching `@types/*` |
| nextjs | next 16.4.2, react and react-dom 19.3.1, `@types/react` and `@types/react-dom` 19.3.0, `@electric-sql/pglite` 0.5.10, `@node-rs/argon2` 2.2.2, geist 1.8.1, sharp 0.35.5, server-only 0.0.1, tsx 4.23.15, tailwindcss and `@tailwindcss/postcss` 4.3.3, postcss 8.5.31, eslint 10.13.0, eslint-config-next 16.4.2, typescript-eslint 8.72.0, `@vitejs/plugin-react` 6.1.2, vite-tsconfig-paths 6.1.1, jsdom 30.1.3, Testing Library (react 16.3.3, dom 10.4.2, user-event 14.6.8, jest-dom 7.0.1), `@playwright/test` 1.64.1, `@next/playwright` and `@next/codemod` 16.4.2, `@modelcontextprotocol/sdk` 1.32.1 |
| react | react and react-dom 19.3.1, `@vitejs/plugin-react` 6.1.2, babel-plugin-react-compiler 1.0.0, `@rolldown/plugin-babel` 0.2.4, react-router 8.4.0, `@tanstack/react-query` and devtools 5.104.4, react-error-boundary 6.1.6, tailwindcss and `@tailwindcss/vite` 4.3.3, clsx 2.1.1, jsdom 30.1.3, happy-dom 21.0.3, Testing Library as above, msw 3.0.3, oxlint 1.88.0, `@vitest/coverage-v8` 5.0.5, `@playwright/test` 1.64.1, express 5.3.0, and for `npm install` lessons zustand 5.0.15, `@reduxjs/toolkit` 2.13.0, react-redux 9.2.0, immer 11.1.21, react-hook-form 7.90.0, `@hookform/resolvers` 6.0.0, `@tanstack/react-router` 1.170.45, `@tanstack/react-virtual` 3.14.21, motion 14.3.1 |
| web | vite 8.3.4, vitest 5.0.5, express 5.3.0, sharp 0.35.5, dompurify 3.4.17, idb 8.0.4, web-vitals 6.2.3, dom-accessibility-api 0.7.1, html-validate 11.16.4, `@axe-core/playwright` 4.14.0, `@playwright/test` 1.64.1 (the package only: Chromium is `hu/check-web`'s) |

### hu/python: FastAPI

Python 3.14.8, uv 0.13.1, plus:

| What | Where | Holds |
| --- | --- | --- |
| uv cache | `/opt/hu/uv-cache`, read-only, 169 MB | The 78 packages of `python/env/fastapi/uv.lock` (every group) and of every template lock, and PyPI's index pages for them (77) |
| uv's view of it | `/tmp/uv-cache` (`UV_CACHE_DIR`) | uv locks and marks its cache on every run, so the `uv` and `uvx` wrappers first run `hu-uv-cache`, which copies everything but the unpacked wheels (21 MB, mostly index pages) into `/tmp` and links `archive-v0` |
| FastAPI scripts | `/opt/hu/env/fastapi/.venv` (120 MB) | The course's runtime packages. Work folder `/opt/hu/env/fastapi/work`, run `/opt/hu/env/fastapi/.venv/bin/python main.py` |
| hu_check | `/opt/hu/python/hu_check.py` | The pytest plugin: `PYTHONPATH=/opt/hu/python pytest -p hu_check --hu-report <file>` writes one JSON line per test (id, title from the docstring's first line, status, message, location, ms) |

Environment: `UV_OFFLINE=1`, `UV_EXCLUDE_NEWER=2026-10-19T17:00:00Z` (the
course's package snapshot: `uv add fastapi` and `uv lock` resolve to what the
cache holds, so FastAPI is 0.148.0, not a newer release), `UV_LINK_MODE=copy`,
`UV_PYTHON_DOWNLOADS=never`, `UV_PYTHON_PREFERENCE=only-system`,
`UV_NO_PROGRESS=1`, `PYTHONPYCACHEPREFIX=/tmp/pycache` (so a read-only venv
never gets `__pycache__`), `PYTHONUNBUFFERED=1` (logs reach the Server tab as
they happen).

Pins: fastapi 0.148.0 (with the `standard-no-fastapi-cloud-cli` extra:
fastapi-cli 0.0.32, uvicorn 0.54.0 with `standard`, starlette 1.9.0),
pydantic 2.14.1 (core 2.50.1), pydantic-settings 2.16.0, sqlalchemy 2.1.5
(with `asyncio`), psycopg 3.3.6 (`binary`), asyncpg 0.32.0, alembic 1.20.0,
anyio 4.15.1, httpx2 2.14.0 (and httpx 0.28.1 from the extra), pyjwt 2.15.1,
pwdlib 0.3.1 (`argon2`), pytest 9.1.1, pytest-cov 7.1.0, ruff 0.17.1, and
uv-build 0.13.1 (for `uv init --app` projects). Template `pyproject.toml`
files set `exclude-newer = "2026-10-19T17:00:00Z"` under `[tool.uv]` and lock
with `uv lock` inside `hu/python`.

### hu/java: Spring Boot

Temurin 25 (25.0.4.1), Maven 3.10.0, plus:

| What | Where | Holds |
| --- | --- | --- |
| Maven repository | `/opt/hu/m2`, read-only, 183 MB | Spring Boot 4.1.1 with every starter the course uses (webmvc, validation, data-jpa, jdbc, flyway with `flyway-database-postgresql`, security, security-oauth2-resource-server, actuator, cache, restclient, jackson, devtools), the test starters (webmvc-test, data-jpa-test, jdbc-test, flyway-test, security-test, restclient-test, resttestclient, testcontainers), springdoc-openapi 3.1.1, ArchUnit 1.5.1, Testcontainers' PostgreSQL module 2.0.5, caffeine, commons-lang3, the PostgreSQL driver, and the plugins of `package`, `test`, `verify` (failsafe), `install`, `spring-boot:run`, `dependency:*`, `help:effective-pom`, and `wrapper:wrapper` |
| Maven's head | `~/.m2/repository` (the home volume) | Maven reads `/opt/hu/m2` as the tail (`MAVEN_ARGS=-Dmaven.repo.local.tail=/opt/hu/m2`) and writes only here. A build of a template leaves 8 KB |
| The wrapper | `MAVEN_USER_HOME=/opt/hu/maven-user` | Maven 3.10.0 where `./mvnw` (Maven Wrapper 3.3.4, `only-script`) looks for the official `apache-maven-3.10.0-bin.zip` URL, so it never downloads. `/opt/hu/maven-user/mvnw` and `.mvn/` are a wrapper to copy into templates |
| Script profiles | `/opt/hu/spring/profiles/<profile>/` | Links into `/opt/hu/m2`: core 9 jars, boot 35, web 50, data 84, secure 96 (`java` is empty), for `javac -cp '/opt/hu/spring/profiles/web/*'` |
| Settings | `/opt/maven/conf/settings.xml` | `offline` and not interactive |

`MAVEN_OPTS=-Xmx384m -XX:TieredStopAtLevel=1 -XX:+UseSerialGC`. Templates use
the Boot 4.1.1 parent with no versions on starters, and the wrapper's
`distributionUrl` is exactly
`https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.10.0/apache-maven-3.10.0-bin.zip`
(SHA-256 `1f6d9909266510f039f59aa0e13dcd2c66da85f043e56276e41f2918f8bddaff`,
for `distributionSha256Sum`).

### hu/go: Go APIs

Go 1.27.2 (gcc for `-race`), plus:

| What | Where | Holds |
| --- | --- | --- |
| Module proxy | `/opt/hu/goproxy`, read-only, 100 MB (`GOPROXY=file:///opt/hu/goproxy,off`) | 55 module versions with their zips and 64 `go.mod` files: everything `go mod tidy`, `go build`, and `go test` need for `go/env/go-api` (pgx 5.11.0, chi 5.5.0, goose 3.29.0, golang-jwt 5.3.1, x/crypto 0.58.0, x/sync 0.24.0, x/time 0.16.0, validator 10.30.5, GORM 1.31.2 with its PostgreSQL driver 1.6.3, x/tools 0.52.0), for each of those packages in a module of its own (minimal version selection picks older versions there), and for every template |
| Shared caches | `/opt/hu/go-build/mod` (`GOMODCACHE`, 119 MB) and `/opt/hu/go-build/cache` (`GOCACHE`, 197 MB) | The seed of the shared `hu-go-build` volume, which every Go container mounts on `/opt/hu/go-build`: Docker copies this into a new volume, so the first build finds the course's modules unpacked and the standard library and those modules compiled (a server's first `go run` answered in 0.24 s) |
| Go scripts | `/opt/hu/env/go-api` | The module (`hu.local/scripts`) a single `main.go` builds in. Work folder `/opt/hu/env/go-api/work`, `go build -o app .` then `./app` (0.27 s warm) |
| Tools (181 MB) | `/usr/local/bin` | sqlc 1.31.1, goose 3.29.0, gotestsum 1.13.0, golangci-lint 2.15.0 (release binaries), air 1.67.4, hey 0.1.5, goimports and stringer (x/tools 0.52.0) |

Environment: `GOTOOLCHAIN=local`, `GOTELEMETRY=off`, `GOFLAGS=-mod=mod`,
`GOSUMDB=off` (the proxy's modules were checked against sum.golang.org when it
was built), `CGO_ENABLED=1`, `GOPATH=/home/learner/go` (on `PATH`).

## What a workspace needs from the runner

- **Mount points.** A new, empty Docker volume takes the owner of the
  image's folder at its mount point, and comes up root's where the image has
  none (`runtime.md` finding 13). The images have learner-owned
  `/workspace/node_modules`, `/workspace/.next`, `/workspace/dist`, and
  `/workspace/.vite-cache` (`hu/web`), `/deps/venv` (`hu/python`),
  `/workspace/target` (`hu/java`), and `/opt/hu/go-build` (`hu/go`, with its
  seed). Mount dependency and build volumes there, or make them learner's some
  other way. `/workspace` is a bind mount and hides these folders, but Docker
  reads ownership from the image.
- **Dependencies** (`runner/stacks.ts`). A job fills a dependency volume once
  per lockfile: npm with the volume on `/workspace/node_modules` and
  `npm ci --offline --ignore-scripts` (0.8 to 7 s), uv with the volume on
  `/deps/venv`, `UV_PROJECT_ENVIRONMENT=/deps/venv`, and
  `uv sync --frozen --offline` (0.7 s). Workspaces then mount it read-only.
  Maven and Go need no fill: the tail and the proxy are in the image.
- **`/tmp`.** npm and uv put their writable cache views in `/tmp` (17 MB and
  21 MB), so a container that runs them needs a writable `/tmp` with that room.
- **`hu-go-build`** on `/opt/hu/go-build` for every Go container, jobs
  included: `GOCACHE` and `GOMODCACHE` live there, and without it the read-only
  image fails the first build.
- **A writable home** for Maven's head (`~/.m2/repository`) and for Vitest 5,
  which writes an API token to `$XDG_DATA_HOME` or `~/.local/share`. A check
  sandbox with a read-only home needs `HOME` or `XDG_DATA_HOME` on a tmpfs.

## Writing templates that run offline with shared dependencies

`node_modules` is shared and read-only in a workspace (§4.4), so a template
keeps every tool's writes out of it:

- **Vite 8** bundles `vite.config.ts` into `node_modules/.vite-temp` unless it
  loads it with Node itself: scripts say `vite --configLoader native`,
  `vite build --configLoader native`, and `vitest run --configLoader native`.
  The config sets `cacheDir: ".vite-cache"`.
- **Vitest 5** caches transformed modules in `node_modules/.vitest-cache`: set
  `test.fsModuleCachePath: ".vitest-cache"` (or pass `--fsModuleCachePath`).
- **Next.js 16.4** writes only to `.next`, so `next dev`, `next build`, and
  `next start` work as they are.
- **uv** runs with the venv read-only as long as the project is in sync:
  `uv run`, `uv run --frozen`, and `uv run --no-sync` all work. Adding a
  package needs the workspace's own venv.
- Lockfiles are made inside the image, offline, so they hold only cached
  versions: `npm install --package-lock-only --ignore-scripts` in `hu/web`,
  `uv lock` in `hu/python`, `go mod tidy` in `hu/go`.
