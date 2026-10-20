# shopfront-ops

The operations repo of a small online shop's backend team, the kind every
company has: service control scripts, a shared Bash library, reports, backup
and log rotation jobs, symlinked releases of the app, a crontab, logs, data
exports and bats tests. The app is `taskapi`, a JSON API (users, orders,
tasks) in Python's standard library with SQLite, so learners have a real
server on a real port to curl, restart, deploy and monitor.

Lessons 28 to 32, 34, 35 and 41 to 44 of the Bash course run here, and so do
eleven workspace challenges (lossless-log-rotation, sales-report-date-range,
ten-second-report, parallel-compress, token-out-of-urls,
idempotent-user-import, pre-deploy-hooks, db-snapshot-before-backup,
test-the-http-lib, alert-on-change, supervisor-with-backoff).

This README is for course authors. The team's own README, the one learners
read, is `base/shopfront-ops/README.md`.

## What is in the template

| Path | What it is |
| --- | --- |
| `template.json` | Volume storage, the `sysadmin` profile, terminal-first, the `/srv` and cron spool volumes, the seed, tasks |
| `base/` | `/home/learner`: `.bashrc`, `.profile`, `.gitconfig` and the repo `shopfront-ops/` (62 files and the `releases/current` symlink) |
| `seed.sh` | Runs as root after `base/` is extracted. About 0.5 s |
| `seed/app-history.tsv` | The app repo's four commits and tags |
| `seed/shopfront-app/<tag>/` | `server.py`, `seed.sql`, `config.json` and `VERSION` of each release |
| `seed/ops-history.tsv`, `seed/ops-history/NN/` | The ops repo's 14 commits, and the older versions of the files later commits change |
| `seed/times.tsv` | Times of the files git does not track |
| `generate.py` | Authoring only: data, logs, the derived releases, `REVISION` (see below) |
| `checks/template/` | The regression suite (`ops.bats`, 27 tests, about 26 s) |

## After seeding

```text
/home/learner/
├── .bashrc, .profile            the same as practice-yard's
├── .gitconfig                   Hack Student <student@hack.local>, init.defaultBranch=main, pull.rebase=false, core.editor=nano
└── shopfront-ops/               a git repo, 14 commits, nothing to commit
    ├── README.md, Makefile, requests.http, .env (600), .env.example, .gitignore, .shellcheckrc
    ├── bin/                     taskapictl and 10 scripts (755), sim/ (3, 755), lib/ (4 libraries, 644)
    ├── releases/                2026-10-01T0900-v2.13.0/, 2026-10-02T0900-v2.14.0/, current -> 2026-10-02T0900-v2.14.0
    ├── config/                  app.conf, crontab.txt, hosts.txt, worker.conf, thresholds.conf, smtp.secret (600)
    ├── data/                    orders.csv (600), customers.csv (120), products.json (30), new-users.csv (25), shop.db
    ├── logs/                    api-access.log (19 Oct to 08:59), .1 (18 Oct), .2.gz (17 Oct), app.log (19 Oct)
    ├── docs/, stubs/, hooks/, tests/, run/ (empty), backups/ and reports/ (.gitkeep)
/srv/git/shopfront.git           bare, branch main, tags v2.13.0 v2.14.0 v2.14.1 v2.15.0-rc1 (lightweight)
```

Everything is learner's. The API is not running: lessons that need it list
`autostart: ["bin/taskapictl start"]`, which takes about 150 ms.

## Fixed facts

Hashes are the same in every workspace, because every commit has a fixed
author, committer and date and git runs with no config files
(`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`):

| Tag | Commit (`git rev-parse --short`) | In `releases/` |
| --- | --- | --- |
| v2.13.0 | `ba5a768` | `2026-10-01T0900-v2.13.0/REVISION` |
| v2.14.0 | `e6ae85a` | `2026-10-02T0900-v2.14.0/REVISION` (current) |
| v2.14.1 | `21d08a8` | built by lesson 43 |
| v2.15.0-rc1 | `2a0ed23` | built by lesson 43; its config needs schema 3, so `/health` answers 500 |

The ops repo's own history ends at `e437b09` (14 commits, the same in every
workspace). Changing any file under `seed/shopfront-app/` changes the tags'
hashes: run
`python3 generate.py` to rewrite the `REVISION` files, and the suite checks
that they match.

taskapi's data (`releases/*/seed.sql`, schema 2, `PRAGMA user_version = 2`):

- Users 1 to 13: 1 ada (admin, password `lovelace`), 2 grace (admin, `cobol`), 3 alan "Alan Turing" (editor), 4 katherine, 5 daan "Daan van der Berg", 6 mila "Mila van der Meer", 7 linus, 8 margaret, 9 edsger, 10 barbara, 11 sophie "Sophie van der Linden", 12 ken (viewer), 13 sloane (the slow user: 5 s). Emails are `<username>@shopfront.example`. Three users match `q=van der`.
- Tokens: `dev-token-123` (ada, admin) and `viewer-token-456` (ken, viewer, for 403s).
- 40 orders (order 9's customer is "Rossi, Giulia", for `@csv`), 25 tasks: ada 7, grace 7, alan 6, katherine 5, 11 done.
- `data/new-users.csv`: 25 rows, 3 already users (alan, barbara, ken), one name with a comma (`"Nakamura, Yui"`), one email without `@` (422).
- `data/orders.csv`: 600 orders from 2026-09-01 to 2026-10-18, product names quoted when they hold commas, one with doubled quotes (`"Poster ""Sunrise"", A3"`). `report-sales.sh -d` counts 551 paid, shipped or delivered orders, 895 units, 10,489.30.

Outputs lessons print (taken from the running template):

| Command | Output |
| --- | --- |
| `bin/taskapictl start` | `taskapi started on 127.0.0.1:8080` |
| `bin/taskapictl status` | `running (pid file run/taskapi.pid, port 8080)`, or `not running` (exit 3) |
| `curl -s localhost:8080/health` | `{"status":"ok","version":"2.14.0"}` |
| status board (`/health /users /users/999 /admin/stats /boom`) | 200, 200, 404, 401, 500 |
| `curl -s --retry 3 --retry-all-errors -H 'X-Request-Id: demo-1' localhost:8080/flaky` | two 503 bodies, then `{"status":"ok","attempt":3}`, in about 3 s |
| `curl -s --max-time 2 --retry 2 localhost:8080/users/13` | exit 28 after about 9 s |
| `bin/report-sales.sh -d tests/fixtures/orders-small.csv` | 3 days, `total 7 13 138.50` |

Every JSON body ends with a newline, so the prompt never sticks to it.
`created_at` of new rows is `HU_FIXED_TIME` when it is set (it is, through
`template.json`), so transcripts repeat. Log lines use the real clock.

## Seeding

```sh
bash seed.sh                                    # as root, after base/ is extracted into /home/learner
```

Steps: owners and modes, `data/shop.db` from `releases/current/seed.sql`,
the bare app repo and the `REVISION` files, the ops history (built in a
scratch folder and moved into place), then times. It fails loudly if the ops
history's last commit differs from `base/` (`git status` must be empty).
`HU_HOME` and `HU_SRV` seed other folders. It needs git, sqlite3, python3,
curl and jq, all in `hu/bash`.

Times: tracked files take their last commit's date, the rest come from
`seed/times.tsv`, folders take their newest entry, and everything is shifted
by (the seed's clock minus the course clock 2026-10-19T09:00:00Z). Under the
frozen clock the dates are exact; in a learner's workspace the ages are the
same, counted back from today.

## Running and the clock

- `taskapi` listens on `127.0.0.1:8080` inside the devbox (the W0 decision
  keeps the fixed port). It reads `API_PORT` from `.env`, never `PORT` or
  `HOST`, so the runner's `PORT` and the image's `HOST=0.0.0.0` do not move
  it. `template.json` declares no ports, and the IDE should not offer 8080
  (or 8090, the docs practice) to the browser.
- Use libfaketime through the environment for disposable runs that start
  the API: `LD_PRELOAD=/usr/lib/<arch>/faketime/libfaketime.so.1 FAKETIME="@2026-10-19 09:00:00"`.
  The `faketime` wrapper waits for every process that shares its clock, so
  `faketime ... bin/taskapictl start` (or `bin/deploy.sh`) never returns
  while the API runs. Running `seed.sh` itself under the wrapper is fine.
- Lesson 30's processes: `setsid bin/sim/report-worker`, `setsid bin/sim/cache-warmer`
  and `setsid bin/sim/cpu-burner --runaway`, each with `> /dev/null 2>&1 < /dev/null &`.
  The burner renices itself to 19 and writes `stopped cleanly` to
  `logs/burner.log` on TERM.
- Script settings for checks: `WORKER_ITEM_SECONDS` (worker.sh, default 0.2),
  `slow-report.sh -s SECONDS`, `FAKE_PING_DELAY` and `FAKE_PING_DOWN`
  (fake-ping.sh: 1 s, `db-2.shop.internal`), and the stubs' `STUB_DF_USE`,
  `STUB_DF_OUTPUT`, `STUB_MEM_TOTAL_MB`, `STUB_MEM_AVAILABLE_MB` and `STUB_LOAD`.

## Notes for lesson authors

- `config/crontab.txt` is the team's crontab with the flaws lesson 41 fixes:
  the `# nightly-report` entry is exactly the outline's broken line, the
  health check has no `flock` and no `2>&1`, the backup runs at 02:30 and logs
  nothing, and the log cleanup logs nothing.
- `tests/report-sales.bats` is partial on purpose (usage and a missing file),
  as lesson 28.2 completes it. `make test` runs 5 tests.
- `taskapictl start` waits until the API answers HTTP at all (any status), up
  to 10 s, rather than the outline's `curl -sf` loop: a release whose
  `/health` answers 500 still starts, and the health check then decides,
  which is what the rollback lesson needs.
- `deploy.sh` restarts the API with `9>&-`, so the restarted server does not
  inherit and hold the deploy lock. Lesson 43's reference solution needs the
  same.
- `report-sales.sh -p` needs jq and says `jq: not found` (exit 127) under
  cron's `PATH`; `-d` needs only awk (`/usr/bin/awk` is gawk 5.4.1 in
  `hu/bash`), so lesson 41.2's nightly report fails on its relative paths and
  `%`, not on jq.
- `log.sh` writes to stderr, or only to `$LOG_FILE` when it is set (the
  worker sets `logs/worker.log`, so a background worker does not flood the
  terminal).
- `make` is not in `hu/bash` yet: the Dockerfile needs Debian's `make`.
