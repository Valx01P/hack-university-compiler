#!/usr/bin/env bats
# The template's own regression suite: the seeded repo, its history, the app
# repo, taskapi's routes and modes, and every script in bin/. It runs as
# learner in a freshly seeded workspace (HU_WS, default /home/learner), on a
# private copy of the repo whose API listens on 18080, so it changes nothing
# the learner sees and never touches port 8080.

bats_require_minimum_version 1.5.0

setup_file() {
  export HOME_DIR=${HU_WS:-/home/learner}
  export ORIGINAL="$HOME_DIR/shopfront-ops"
  export OPS="$BATS_FILE_TMPDIR/shopfront-ops"
  cp -a "$ORIGINAL" "$OPS"
  rm -rf "$OPS/run" "$OPS/backups/"shopfront-* "$OPS/backups/SHA256SUMS"
  sed -i -e 's/^API_PORT=.*/API_PORT=18080/' -e 's|^API_URL=.*|API_URL=http://127.0.0.1:18080|' "$OPS/.env"
  export API=http://127.0.0.1:18080
  export TOKEN=dev-token-123
  export HU_FIXED_TIME=2026-10-19T09:00:00Z
  FAKETIME_LIB=$(find /usr/lib -path '*faketime/libfaketime.so.1' | head -n 1)
  export FAKETIME_LIB
}

teardown_file() {
  "$OPS/bin/taskapictl" stop > /dev/null 2>&1 || true
  pkill -f "$OPS/bin/" 2> /dev/null || true
}

setup() {
  bats_load_library bats-support
  bats_load_library bats-assert
  cd "$OPS" || return 1
}

# at TIME CMD...: runs CMD with the clock starting at TIME (libfaketime through
# LD_PRELOAD, not the faketime wrapper, which waits for every background child).
at() {
  local when=$1
  shift
  LD_PRELOAD=$FAKETIME_LIB FAKETIME="@$when" "$@"
}

api_up() {
  bin/taskapictl start > /dev/null
}

code() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

# --- The seeded repo -----------------------------------------------------------

@test "the repo has the outline's layout, with .env at mode 600 and the scripts executable" {
  cd "$ORIGINAL"
  for path in README.md Makefile .env.example .env .gitignore .shellcheckrc requests.http \
    bin/taskapictl bin/healthcheck.sh bin/report-sales.sh bin/backup.sh bin/rotate-logs.sh bin/deploy.sh \
    bin/new-user.sh bin/worker.sh bin/slow-report.sh bin/metrics-collector.sh bin/fake-ping.sh \
    bin/sim/report-worker bin/sim/cache-warmer bin/sim/cpu-burner bin/lib/log.sh bin/lib/env.sh \
    bin/lib/http.sh bin/lib/strings.sh config/app.conf config/crontab.txt config/hosts.txt \
    config/worker.conf config/thresholds.conf data/orders.csv data/customers.csv data/products.json \
    data/new-users.csv data/shop.db logs/api-access.log logs/api-access.log.1 logs/api-access.log.2.gz \
    logs/app.log docs/index.html docs/runbook.html stubs/df stubs/free stubs/uptime hooks/README.md \
    tests/log.bats tests/report-sales.bats tests/helpers/stub.bash tests/fixtures/orders-small.csv \
    backups/.gitkeep reports/.gitkeep; do
    assert [ -e "$path" ]
  done
  assert [ -d run ]
  run stat -c '%a' .env
  assert_output 600
  run bash -c 'find bin stubs -type f ! -path "*/lib/*" ! -perm -u+x'
  assert_output ''
  run bash -c 'find bin/lib -type f -perm -u+x'
  assert_output ''
}

@test "the repo's history: 14 commits by three people, nothing uncommitted" {
  cd "$ORIGINAL"
  run git rev-list --count HEAD
  assert_output 14
  run bash -c 'git log --format=%an | sort -u'
  assert_output "$(printf '%s\n' 'Marcus Webb' 'Priya Raman' 'Sofia Lindqvist')"
  run git log --format='%ad %s' --date=short --reverse
  assert_line --index 0 '2026-08-31 Start the ops repo: README, Makefile and settings'
  assert_line --index 13 '2026-10-13 Add the docs pages, the user import file and a fuller README'
  run git status --porcelain
  assert_output ''
  run git check-ignore .env data/shop.db logs/app.log releases/current run config/smtp.secret
  assert_output "$(printf '%s\n' .env data/shop.db logs/app.log releases/current run config/smtp.secret)"
  run git log --format=%s -- bin/healthcheck.sh
  assert_output "$(printf '%s\n' 'Retry the health check with -r and -t' 'Add a health check for the API')"
}

@test "the app repo has the four release tags, and each release's REVISION matches its tag" {
  run git ls-remote --tags /srv/git/shopfront.git
  assert_equal "$(cut -f 2 <<< "$output")" "$(printf 'refs/tags/%s\n' v2.13.0 v2.14.0 v2.14.1 v2.15.0-rc1)"
  run readlink "$ORIGINAL/releases/current"
  assert_output 2026-10-02T0900-v2.14.0
  for tag in v2.13.0 v2.14.0; do
    release=$(find "$ORIGINAL/releases" -maxdepth 1 -name "*-$tag")
    assert_equal "$(cat "$release/REVISION")" "$(git -C /srv/git/shopfront.git rev-parse --short "$tag")"
    run bash -c "git -C /srv/git/shopfront.git archive $tag | tar -t | sort"
    assert_output "$(printf '%s\n' VERSION config.json seed.sql server.py)"
  done
  run git -C /srv/git/shopfront.git show v2.15.0-rc1:config.json
  assert_output --partial '"required_schema": 3'
  run git -C /srv/git/shopfront.git show v2.14.1:VERSION
  assert_output 2.14.1
}

@test "the data files have the outline's sizes and edge cases" {
  run bash -c 'tail -n +2 data/orders.csv | wc -l'
  assert_output 600
  run head -n 1 data/orders.csv
  assert_output 'id,date,customer_id,product,qty,unit_price,status'
  run grep -c '"' data/orders.csv
  (( output > 100 ))
  run grep -c '""Sunrise""' data/orders.csv
  (( output > 0 ))
  run bash -c 'tail -n +2 data/customers.csv | wc -l'
  assert_output 120
  run grep -c '^[0-9]*,"' data/customers.csv
  assert_output 5
  run jq length data/products.json
  assert_output 30
  run jq -r '[.[] | select(.name and .category and .price and .stock and .sku)] | length' data/products.json
  assert_output 30
  run bash -c 'tail -n +2 data/new-users.csv | wc -l'
  assert_output 25
  run grep -c '^"Nakamura, Yui"' data/new-users.csv
  assert_output 1
  run bash -c "awk --csv 'NR > 1 && \$2 !~ /@/' data/new-users.csv | wc -l"
  assert_output 1
  run bash -c "sqlite3 data/shop.db \"SELECT count(*) FROM users WHERE email IN ('alan@shopfront.example', 'barbara@shopfront.example', 'ken@shopfront.example')\""
  assert_output 3
}

@test "the database: 13 users (13 is the slow one), 40 orders, 25 tasks of 4 owners, schema 2" {
  run sqlite3 data/shop.db 'PRAGMA user_version; SELECT count(*) FROM users; SELECT count(*) FROM orders; SELECT count(*) FROM tasks; SELECT count(DISTINCT owner) FROM tasks;'
  assert_output "$(printf '%s\n' 2 13 40 25 4)"
}

@test "the logs: today's access log, yesterday's, the day before gzipped, and the app log as JSON lines" {
  run head -n 1 logs/api-access.log
  assert_output --regexp '^127\.0\.0\.1 - [a-z-]+ \[19/Oct/2026:00:0[0-9]:[0-9]{2} \+0000\] "GET /[^"]*" [0-9]{3} [0-9]+ "-" "[^"]+" [0-9]+\.[0-9]{3}$'
  run bash -c 'cut -d"[" -f2 logs/api-access.log.1 | cut -d: -f1 | sort -u'
  assert_output 18/Oct/2026
  run bash -c 'zcat logs/api-access.log.2.gz | cut -d"[" -f2 | cut -d: -f1 | sort -u'
  assert_output 17/Oct/2026
  run jq -r 'select(.status >= 500) | .level' logs/app.log
  assert_line --index 0 error
  refute_output --partial info
  run jq -r 'select(.level == "error" and .status == null) | .msg' logs/app.log
  assert_output 'unhandled error: RuntimeError: boom: this route always fails, on purpose'
  run bash -c 'jq -r "select(.status == 200 and .route == \"/users/{id}\" and .ms > 4000) | .msg" logs/app.log'
  assert_output 'slow request'
}

@test "make test and make lint pass" {
  command -v make || fail "the image has no make: hu/bash needs Debian's make package"
  run make -s test
  assert_success
  assert_output --partial 'ok 5 '
  run make -s lint
  assert_success
  assert_output ''
}

# --- taskapi -------------------------------------------------------------------

@test "taskapictl start, status, health, then a second start says already running" {
  run bin/taskapictl start
  assert_success
  assert_output 'taskapi started on 127.0.0.1:18080'
  run bin/taskapictl status
  assert_output 'running (pid file run/taskapi.pid, port 18080)'
  run bin/taskapictl health
  assert_output healthy
  run bin/taskapictl start
  assert_output 'taskapi is already running (pid file run/taskapi.pid)'
  run bash -c "ss -Htln 'sport = :18080'"
  assert_output --partial '127.0.0.1:18080'
  run bin/taskapictl nope
  assert_failure 64
  assert_output --partial usage
}

@test "GET routes answer with the documented codes and bodies" {
  api_up
  run curl -s "$API/health"
  assert_output '{"status":"ok","version":"2.14.0"}'
  run curl -s "$API/users/3"
  assert_output '{"id":3,"username":"alan","name":"Alan Turing","email":"alan@shopfront.example","role":"editor","created_at":"2026-02-03T10:20:00Z"}'
  for pair in '200 /health' '200 /users' '404 /users/999' '401 /admin/stats' '500 /boom' '200 /orders' '200 /orders/9' '404 /orders/41' '200 /tasks' '404 /nope'; do
    assert_equal "$(code "$API${pair#* }") ${pair#* }" "$pair"
  done
  run curl -s "$API/users/999"
  assert_output '{"error":"user not found"}'
  run curl -sI "$API/health"
  assert_line --index 0 --partial 'HTTP/1.1 200 OK'
  run bash -c "curl -sG '$API/users' --data-urlencode 'q=van der' --data-urlencode 'per_page=2' | jq -c '[.data[] | {id, name}], .page, .total, .next'"
  assert_output "$(printf '%s\n' '[{"id":5,"name":"Daan van der Berg"},{"id":6,"name":"Mila van der Meer"}]' 1 3 '"/users?q=van+der&page=2&per_page=2"')"
  run bash -c "curl -s '$API/orders?per_page=100' | jq -c '[.per_page, .total, (.data | length), .next]'"
  assert_output '[25,40,25,"/orders?page=2&per_page=25"]'
  run bash -c "curl -s '$API/orders/9' | jq -r .customer"
  assert_output 'Rossi, Giulia'
  run bash -c "curl -s '$API/tasks?owner=ada' | jq '.total'"
  assert_output 7
}

@test "tasks: create, patch and delete with the token, 401 without it, 403 for a viewer" {
  api_up
  run bash -c "curl -s --json '{\"title\":\"Write docs\"}' -H 'Authorization: Bearer $TOKEN' '$API/tasks' | jq -c 'del(.id)'"
  assert_output '{"title":"Write docs","owner":"ada","done":false,"created_at":"2026-10-19T09:00:00Z"}'
  id=$(curl -s --json '{"title":"Fix \"login\" bug"}' -H "Authorization: Bearer $TOKEN" "$API/tasks" | jq .id)
  run curl -s -X PATCH --json '{"done":true}' -H "Authorization: Bearer $TOKEN" "$API/tasks/$id"
  assert_output --partial '"title":"Fix \"login\" bug","owner":"ada","done":true'
  assert_equal "$(code -X DELETE -H "Authorization: Bearer $TOKEN" "$API/tasks/$id")" 204
  assert_equal "$(code "$API/tasks/$id")" 404
  run curl -s --json '{"title":"x"}' "$API/tasks"
  assert_output '{"error":"missing or invalid token"}'
  assert_equal "$(code --json '{"title":"x"}' -H 'Authorization: Bearer viewer-token-456' "$API/tasks")" 403
  assert_equal "$(code -H 'Authorization: Bearer viewer-token-456' "$API/admin/stats")" 403
  assert_equal "$(code -X POST -d 'title=x' -H "Authorization: Bearer $TOKEN" "$API/tasks")" 415
  run curl -s --json '{"title":""}' -H "Authorization: Bearer $TOKEN" "$API/tasks"
  assert_output '{"error":"validation failed","fields":{"title":"is required"}}'
  run curl -si "$API/admin/stats"
  assert_output --partial 'WWW-Authenticate: Bearer'
}

@test "users: 201 with Location, 409 for a taken email, 422 for bad fields" {
  api_up
  run curl -si --json '{"name":"Nakamura, Yui","email":"yui.nakamura@shopfront.example"}' -H "Authorization: Bearer $TOKEN" "$API/users"
  assert_line --index 0 --partial '201 Created'
  assert_output --partial 'Location: /users/14'
  assert_output --partial '"name":"Nakamura, Yui"'
  assert_equal "$(code --json '{"name":"Alan","email":"ALAN@shopfront.example"}' -H "Authorization: Bearer $TOKEN" "$API/users")" 409
  run curl -s --json '{"name":"Luis","email":"luis.ortega.shopfront.example"}' -H "Authorization: Bearer $TOKEN" "$API/users"
  assert_output '{"error":"validation failed","fields":{"email":"must be a valid email address"}}'
  run bin/new-user.sh -n 'Grace Ng' -e grace.ng@shopfront.example -r editor
  assert_success
  assert_output 15
}

@test "login sets an HttpOnly session cookie that /me reads, and logout clears it" {
  api_up
  run curl -s -c "$BATS_TEST_TMPDIR/jar.txt" --json '{"user":"ada","password":"lovelace"}' "$API/login"
  assert_output '{"user":"ada","name":"Ada Lovelace"}'
  run grep -c '^#HttpOnly_127.0.0.1' "$BATS_TEST_TMPDIR/jar.txt"
  assert_output 1
  run bash -c "curl -s -b '$BATS_TEST_TMPDIR/jar.txt' '$API/me' | jq -r .username"
  assert_output ada
  assert_equal "$(code --json '{"user":"ada","password":"wrong"}' "$API/login")" 401
  assert_equal "$(code -X POST -b "$BATS_TEST_TMPDIR/jar.txt" "$API/logout")" 204
  assert_equal "$(code -b "$BATS_TEST_TMPDIR/jar.txt" "$API/me")" 401
}

@test "slow, flaky and the slow user: timeouts and retries behave as the curl lesson says" {
  api_up
  run curl -s --max-time 1 "$API/slow?ms=3000"
  assert_failure 28
  run curl -s --retry 3 --retry-all-errors -H 'X-Request-Id: suite-1' "$API/flaky"
  assert_success
  assert_line --index 0 '{"error":"temporarily unavailable, try again","attempt":1}'
  assert_line --index 2 '{"status":"ok","attempt":3}'
  run curl -s --max-time 2 "$API/users/13"
  assert_failure 28
  run curl -s "$API/slow?ms=10"
  assert_output '{"slept_ms":10}'
}

@test "a token in the query string works, and the app log says how each request authenticated" {
  api_up
  assert_equal "$(code "$API/admin/stats?token=$TOKEN")" 200
  run bash -c "grep -c 'token=$TOKEN' logs/api-access.log"
  assert_output 1
  run bash -c "jq -r 'select(.route == \"/admin/stats\" and .msg == \"request\" and .auth != null) | .auth' logs/app.log | tail -n 1"
  assert_output query
  curl -s -o /dev/null -H "Authorization: Bearer $TOKEN" "$API/admin/stats"
  run bash -c "jq -r 'select(.route == \"/admin/stats\" and .msg == \"request\" and .auth != null) | .auth' logs/app.log | tail -n 1"
  assert_output header
  run grep -c 'token sent in the query string' logs/app.log
  assert_output 1
}

@test "practice modes: rate limit, broken-delete, broken-users and slow-health" {
  api_up
  bin/taskapictl restart --rate-limit 5/s > /dev/null
  sleep 1.1
  run bash -c "for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w '%{http_code} ' '$API/health'; done"
  assert_output '200 200 200 200 200 429 429 '
  run bash -c "curl -s -D - -o /dev/null '$API/health' | grep -i '^retry-after'"
  assert_output --partial 'Retry-After: 1'
  sleep 1.1
  bin/taskapictl restart --mode broken-delete > /dev/null
  id=$(curl -s --json '{"title":"tmp"}' -H "Authorization: Bearer $TOKEN" "$API/tasks" | jq .id)
  assert_equal "$(code -X DELETE -H "Authorization: Bearer $TOKEN" "$API/tasks/$id")" 500
  bin/taskapictl restart --mode broken-users > /dev/null
  assert_equal "$(code "$API/users")" 500
  assert_equal "$(code "$API/health")" 200
  bin/taskapictl restart --mode slow-health > /dev/null
  run curl -s -o /dev/null -w '%{time_total}' "$API/health"
  (( ${output%%.*} >= 1 ))
  run bin/taskapictl health
  assert_output healthy
  bin/taskapictl restart > /dev/null
}

@test "HUP reopens the log files, and TERM finishes the request in flight, then exits 0" {
  api_up
  mv logs/app.log logs/app.log.old
  kill -HUP "$(< run/taskapi.pid)"
  sleep 0.3
  curl -s -o /dev/null "$API/health"
  run head -n 1 logs/app.log
  assert_output --partial '"msg":"reopened log files"'
  pid=$(< run/taskapi.pid)
  curl -s "$API/slow?ms=1000" > "$BATS_TEST_TMPDIR/answer" &
  client=$!
  sleep 0.3
  kill -TERM "$pid"
  wait "$client"
  run cat "$BATS_TEST_TMPDIR/answer"
  assert_output '{"slept_ms":1000}'
  for _ in {1..30}; do kill -0 "$pid" 2> /dev/null || break; sleep 0.1; done
  run kill -0 "$pid"
  assert_failure
  run tail -n 1 logs/app.log
  assert_output --partial '"msg":"shutdown complete"'
  run bin/taskapictl status
  assert_failure 3
  assert_output --partial 'not running'
}

@test "a second server on the same port fails with Address already in use" {
  api_up
  run python3 releases/current/server.py --port 18080 --db data/shop.db --log-dir "$BATS_TEST_TMPDIR"
  assert_failure 1
  assert_output --partial 'OSError: [Errno 98] Address already in use'
}

# --- Scripts -------------------------------------------------------------------

@test "report-sales.sh: totals by day and by product on the fixture, and its errors" {
  run bin/report-sales.sh -d tests/fixtures/orders-small.csv
  assert_output "$(printf '%s\n' \
    'date        orders  units    revenue' \
    '2026-10-01       3      6      69.50' \
    '2026-10-02       3      6      45.00' \
    '2026-10-03       1      1      24.00' \
    'total            7     13     138.50')"
  run bin/report-sales.sh -p tests/fixtures/orders-small.csv
  assert_output "$(printf '%s\n' \
    'sku         units    revenue  product' \
    'MUG-350         3      42.00  Mug, stoneware, 350 ml' \
    'CND-FIG         1      24.00  Candle, fig and cedar' \
    'PST-SUN         1      22.00  Poster "Sunrise", A3' \
    'NB-A5-DOT       3      19.50  Notebook, A5, dotted' \
    'BLM-LIP         4      16.00  Lip balm' \
    'BAG-TOT         1      15.00  Tote bag, canvas')"
  run bin/report-sales.sh -x
  assert_failure 64
  assert_output --partial usage
  run bin/report-sales.sh
  assert_failure 64
  run bin/report-sales.sh -d
  assert_success
  assert_line --index 1 '2026-09-01      12     18     202.80'
  assert_line --index -1 'total          551    895   10489.30'
  run -127 env -i HOME="$HOME" PATH=/usr/bin:/bin bin/report-sales.sh -p
  assert_output --partial 'jq: not found'
}

@test "healthcheck.sh: healthy when the API answers, unhealthy after N attempts when not" {
  api_up
  run bin/healthcheck.sh -u "$API"
  assert_success
  assert_output healthy
  bin/taskapictl stop > /dev/null
  run bin/healthcheck.sh -u "$API" -r 2 -t 1
  assert_failure 1
  assert_line --index -1 'unhealthy after 2 attempts'
  run bin/healthcheck.sh -r 0
  assert_failure 64
}

@test "backup.sh: a UTC-named archive of data/ and config/, its checksum, and the missing-folder error" {
  run at '2026-10-19 09:00:00' bin/backup.sh
  assert_success
  assert_output backups/shopfront-20261019-090000.tar.gz
  run bash -c 'tar -tzf backups/shopfront-20261019-090000.tar.gz | sort | head -n 3'
  assert_output "$(printf '%s\n' config/ config/app.conf config/crontab.txt)"
  run bash -c 'cd backups && sha256sum -c SHA256SUMS'
  assert_output 'shopfront-20261019-090000.tar.gz: OK'
  mv data data.away
  run bin/backup.sh
  mv data.away data
  assert_failure 1
  assert_output 'error: data/ not found'
}

@test "rotate-logs.sh: .1, then .2.gz to .5.gz, HUP to the API, and nothing older" {
  api_up
  for _ in 1 2 3 4 5 6 7; do
    curl -s -o /dev/null "$API/health"
    bin/rotate-logs.sh > /dev/null
  done
  run bash -c 'ls logs | grep "^api-access"'
  assert_output "$(printf '%s\n' api-access.log api-access.log.1 api-access.log.2.gz api-access.log.3.gz api-access.log.4.gz api-access.log.5.gz)"
  curl -s -o /dev/null "$API/users/3"
  run grep -c 'GET /users/3 ' logs/api-access.log
  assert_output 1
  : > logs/app.log
  run bin/rotate-logs.sh logs/app.log
  assert_output 'skipped logs/app.log (empty or missing)'
}

@test "deploy.sh: v2.14.1 goes live, v2.15.0-rc1 fails its health check and rolls back" {
  api_up
  run at '2026-10-19 09:00:00' bin/deploy.sh --dry-run v2.14.1
  assert_success
  assert_line --index 0 --partial 'would build releases/2026-10-19T0900-v2.14.1 from v2.14.1'
  run bin/deploy.sh v9.9.9
  assert_failure 1
  assert_output 'unknown version: v9.9.9'
  run at '2026-10-19 09:00:00' bin/deploy.sh v2.14.1
  assert_success
  assert_line --index -1 '2026-10-19T09:00:00Z deployed v2.14.1'
  assert_equal "$(readlink releases/current)" 2026-10-19T0900-v2.14.1
  assert_equal "$(cat releases/current/REVISION)" "$(git -C /srv/git/shopfront.git rev-parse --short v2.14.1)"
  run curl -s "$API/health"
  assert_output '{"status":"ok","version":"2.14.1"}'
  run at '2026-10-19 09:05:00' bin/deploy.sh v2.15.0-rc1
  assert_failure 1
  assert_line --index -1 '2026-10-19T09:05:00Z rolled back to 2026-10-19T0900-v2.14.1'
  assert_equal "$(readlink releases/current)" 2026-10-19T0900-v2.14.1
  run curl -s "$API/health"
  assert_output '{"status":"ok","version":"2.14.1"}'
  run grep -c -e 'deployed v2.14.1' -e 'rolled back' logs/deploy.log
  assert_output 2
  run bash -c "ls -l /proc/\$(cat run/taskapi.pid)/fd | grep -c deploy.lock"
  assert_output 0
}

@test "worker.sh: HUP reloads the batch size, TERM finishes the item in hand and exits 0" {
  WORKER_ITEM_SECONDS=0.05 bin/worker.sh &
  worker=$!
  sleep 0.4
  assert_equal "$(cat run/worker.pid)" "$worker"
  sed -i 's/^batch=.*/batch=3/' config/worker.conf
  kill -HUP "$worker"
  sleep 0.8
  kill -TERM "$worker"
  local rc=0
  wait "$worker" || rc=$?
  assert_equal "$rc" 0
  run grep -v 'processed item' logs/worker.log
  assert_line --index 0 --regexp '^[0-9T:-]+Z INFO started: batch=10$'
  assert_line --index 1 --regexp '^[0-9T:-]+Z INFO reloaded: batch=3$'
  assert_line --index 2 --regexp '^[0-9T:-]+Z INFO shutdown complete$'
  assert [ ! -e run/worker.pid ]
}

@test "the sim processes stop at once on TERM, and the runaway burner says it stopped cleanly" {
  setsid bin/sim/report-worker > /dev/null 2>&1 < /dev/null &
  setsid bin/sim/cpu-burner --runaway > /dev/null 2>&1 < /dev/null &
  sleep 0.5
  run pgrep -c -f "$OPS/bin/sim/|bin/sim/(report-worker|cpu-burner)"
  (( output >= 2 ))
  pkill -TERM -f 'cpu-burner --runaway'
  pkill -TERM -f 'sim/report-worker'
  sleep 0.5
  run pgrep -f 'bin/sim/(report-worker|cpu-burner)'
  assert_failure
  run tail -n 1 logs/burner.log
  assert_output --regexp 'stopped cleanly after [0-9]+ spins$'
}

@test "fake-ping.sh: one second per host, db-2 is down, and the stubs print fixed numbers" {
  run bin/fake-ping.sh db-1.shop.internal
  assert_success
  run bin/fake-ping.sh db-2.shop.internal
  assert_failure 1
  FAKE_PING_DOWN='' FAKE_PING_DELAY=0 run bin/fake-ping.sh db-2.shop.internal
  assert_success
  run wc -l < config/hosts.txt
  assert_output 6
  PATH="$PWD/stubs:$PATH" STUB_DF_USE=91 run df -P /
  assert_line --index 1 --regexp '^overlay +[0-9]+ +[0-9]+ +[0-9]+ +91% /$'
  PATH="$PWD/stubs:$PATH" STUB_MEM_AVAILABLE_MB=123 run free -m
  assert_line --index 1 --regexp ' 123$'
  PATH="$PWD/stubs:$PATH" STUB_LOAD=2.50 run uptime
  assert_output --partial 'load average: 2.50, 0.35, 0.30'
}

@test "the docs folder serves with the Shopfront Ops title" {
  python3 -m http.server 18090 --bind 127.0.0.1 --directory docs > /dev/null 2>&1 &
  server=$!
  for _ in {1..30}; do curl -s -o /dev/null "http://127.0.0.1:18090/" && break; sleep 0.1; done
  run curl -s http://127.0.0.1:18090/
  kill "$server"
  assert_output --partial '<title>Shopfront Ops</title>'
}

@test "the crontab installs, and its nightly-report entry is the one lesson 41 fixes" {
  run grep -A1 '^# nightly-report$' config/crontab.txt
  # shellcheck disable=SC2016
  assert_line --index 1 '0 1 * * * report-sales.sh -d > reports/daily-$(date +%F).txt'
  run crontab -l
  if [[ $status -eq 0 ]]; then
    skip "a crontab is already installed for $(id -un)"
  fi
  crontab config/crontab.txt
  run crontab -l
  crontab -r
  assert_output --partial '# health-check'
}
