#!/usr/bin/env bash
# The batch worker: works through the job queue in batches of $batch items
# (from config/worker.conf), logging to logs/worker.log. TERM or INT lets it
# finish the item in hand, log "shutdown complete" and exit 0. HUP re-reads
# config/worker.conf. Its pid is in run/worker.pid while it runs.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib/log.sh
source "$ROOT/bin/lib/log.sh"

CONF="$ROOT/config/worker.conf"
PIDFILE="$ROOT/run/worker.pid"
LOG_FILE=${LOG_FILE:-$ROOT/logs/worker.log}
ITEM_SECONDS=${WORKER_ITEM_SECONDS:-0.2}

read_batch() {
  local value
  value=$(awk -F= '$1 == "batch" { print $2 }' "$CONF")
  if [[ ! $value =~ ^[1-9][0-9]*$ ]]; then
    log_warn "config/worker.conf has no valid batch=N, using 10"
    value=10
  fi
  batch=$value
}

running=1
reload=0
trap 'running=0' TERM INT
trap 'reload=1' HUP

mkdir -p -- "$ROOT/run" "$(dirname -- "$LOG_FILE")"
echo "$$" > "$PIDFILE"
read_batch
log_info "started: batch=$batch"

item=0
while ((running)); do
  for ((i = 0; i < batch && running; i++)); do
    item=$((item + 1))
    sleep "$ITEM_SECONDS"
    log_info "processed item $item"
  done
  if ((reload)); then
    reload=0
    read_batch
    log_info "reloaded: batch=$batch"
  fi
done

rm -f -- "$PIDFILE"
log_info "shutdown complete"
