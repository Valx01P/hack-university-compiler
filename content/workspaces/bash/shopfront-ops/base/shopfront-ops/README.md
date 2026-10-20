# shopfront-ops

The operations repo of the shop's backend team: the scripts that start,
check, back up, rotate and deploy `taskapi`, the shop's JSON API, plus the
reports finance asks for, the crontab and the tests that keep it all honest.

Everything here is Bash and standard tools (curl, jq, awk, tar, git, sqlite3).
`taskapi` itself is a small Python server whose releases are built from the
app repo, `/srv/git/shopfront.git`.

## Quick start

```sh
cd ~/shopfront-ops
make api                     # taskapi started on 127.0.0.1:8080
curl -s localhost:8080/health
make test                    # the bats tests
make                         # every target
```

`.env` holds the local settings (`.env.example` documents each one). It has a
token in it, so it is mode 600 and never committed.

## What is where

```text
bin/
  taskapictl            start | stop | restart | status | health | logs | reset
  healthcheck.sh        curl /health with retries (-r) and a time limit (-t): exit 0 or 1
  report-sales.sh       sales by day (-d) or by product (-p) from data/orders.csv
  backup.sh             data/ and config/ into backups/, with checksums
  rotate-logs.sh        rotate the API's logs, then HUP the API so it reopens them
  deploy.sh             build a release from a git tag, switch, restart, check, roll back
  new-user.sh           create an API user from flags, print the new id
  worker.sh             the batch worker (graceful on TERM, reloads on HUP)
  slow-report.sh        a 60 second job, handy for practicing jobs, fg and bg
  metrics-collector.sh  one line of load and memory per second to logs/metrics.log
  fake-ping.sh          a pretend ping with a fixed delay, for parallel checks
  sim/                  report-worker, cache-warmer, cpu-burner: stand-in processes
  lib/
    log.sh              log_info, log_warn, log_error: UTC timestamped lines
    env.sh              load_env FILE [NAME...]: export a .env file, require settings
    http.sh             api_get, api_post, api_patch, api_delete around curl
    strings.sh          trim, repeat, slugify, join_by
releases/               one folder per deployed version, and current -> the live one
config/                 app.conf, crontab.txt, hosts.txt, worker.conf, thresholds.conf
data/                   orders.csv, customers.csv, products.json, new-users.csv, shop.db
logs/                   api-access.log (and .1, .2.gz ...), app.log, and job logs
docs/                   index.html and runbook.html
stubs/                  fake df, free and uptime for tests (put stubs/ first in PATH)
hooks/                  the planned deploy hooks (see hooks/README.md)
tests/                  bats tests, helpers/stub.bash, fixtures/
run/                    pid files and lock files (not committed)
backups/, reports/      output (not committed)
```

Every script starts with `set -euo pipefail`, finds the repo with
`ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)`, takes its
settings from `.env` through `load_env`, prints a usage line for `-h`, and
exits 64 for bad usage. `make lint` runs ShellCheck on all of them and must
stay clean.

## taskapi

The API listens on `127.0.0.1:$API_PORT` (8080) and only answers JSON.
`releases/current/server.py` is the running code, `data/shop.db` its SQLite
database, and `bin/taskapictl reset` rebuilds the database from
`releases/current/seed.sql`. `requests.http` has one request per route.

| Route | Notes |
| --- | --- |
| `GET /health` | `{"status":"ok","version":"2.14.0"}`, or 500 when the database schema does not match the release |
| `GET /users?q=&role=&page=&per_page=` | Paginated: `data`, `page`, `per_page`, `total`, `next`. `per_page` is capped at 25 |
| `GET /users/{id}` | 404 `{"error":"user not found"}`. User 13 answers after 5 seconds |
| `POST /users` | Admin token. 201 with `Location`, 409 for a taken email, 422 for bad fields |
| `GET /orders`, `GET /orders/{id}` | Paginated like users, `?status=` filters |
| `GET /tasks`, `POST /tasks` | `?owner=` and `?done=` filter. Writes need an editor or admin |
| `GET`, `PATCH`, `DELETE /tasks/{id}` | `DELETE` answers 204 |
| `GET /admin/stats` | 401 with `WWW-Authenticate: Bearer` without a token, 403 for a viewer |
| `POST /login`, `GET /me`, `POST /logout` | A session in an `HttpOnly` cookie (`ada` / `lovelace`) |
| `GET /slow?ms=N` | Answers after N milliseconds |
| `GET /flaky` | 503 twice for each `X-Request-Id`, then 200 |
| `GET /boom` | Always 500, for testing alerts |

Tokens: `dev-token-123` is an admin (Ada), `viewer-token-456` a viewer (Ken).
Scripts send the token in an `Authorization: Bearer` header. The API still
accepts `?token=`, logs a warning for it, and will stop accepting it.

Logs: every request goes to `logs/api-access.log` (the combined format plus
the request time in seconds) and to `logs/app.log` (one JSON object per line:
`ts`, `level`, `method`, `route`, `status`, `ms`, `msg`, `trace_id`, and `user`
and `auth` when a request was authenticated). A `HUP` makes the API reopen
both files, which is how `rotate-logs.sh` rotates them without losing lines.
A `TERM` lets requests in flight finish, logs `shutdown complete` and exits 0.

Practice switches, passed through `taskapictl start` or `restart`:

| Option | Effect |
| --- | --- |
| `--rate-limit 5/s` | 429 with `Retry-After: 1` above 5 requests a second |
| `--mode broken-delete` | `DELETE /tasks/{id}` answers 500 |
| `--mode broken-users` | every `/users` route answers 500 |
| `--mode slow-health` | `/health` takes 1.4 seconds |

When `HU_FIXED_TIME` is set, new rows get it as their `created_at`, so
examples print the same thing every time. Log lines always use the real clock.

## Deploying

Versions are git tags in `/srv/git/shopfront.git`:

```sh
git ls-remote --tags /srv/git/shopfront.git
bin/deploy.sh --dry-run v2.14.1     # the plan, without changing anything
bin/deploy.sh v2.14.1
```

`deploy.sh` takes a lock (`run/deploy.lock`), exports the tag into
`releases/<UTC time>-<version>/` with `git archive`, writes the commit to
`REVISION`, points `releases/current` at it atomically (a new symlink, then
`mv -T`), restarts the API and runs `healthcheck.sh -r 3 -t 2`. If the check
fails it points `current` back at the previous release, restarts, logs
`rolled back to ...` in `logs/deploy.log` and exits 1. It keeps the newest 5
releases. `v2.15.0-rc1` needs a database migration we have not written, so
its `/health` answers 500: deploying it is a good way to watch a rollback.

## Cron

`config/crontab.txt` is the team's crontab. Install it with
`crontab config/crontab.txt` and check it with `crontab -l`. Remember that
cron runs jobs with `PATH=/usr/bin:/bin` from your home folder, with no
`.bashrc`: use absolute paths, set `PATH` at the top of the file, write `%` as
`\%`, and send each job's output to a log.

## Backups

`bin/backup.sh` writes `backups/shopfront-YYYYMMDD-HHMMSS.tar.gz` (UTC) and
appends its checksum to `backups/SHA256SUMS`. To prove a backup works,
restore it somewhere else and compare:

```sh
(cd backups && sha256sum -c SHA256SUMS)
tmp=$(mktemp -d) && tar -xzf backups/shopfront-*.tar.gz -C "$tmp" && diff -r "$tmp/config" config
```

## On call

See `docs/runbook.html` (serve the folder with
`python3 -m http.server 8090 --bind 127.0.0.1 --directory docs`). The short
version: `bin/taskapictl status`, `bin/healthcheck.sh -r 3`, read the errors
with `jq -r 'select(.level == "error") | [.ts, .route, .msg] | @tsv' logs/app.log`,
then `bin/taskapictl restart`.
