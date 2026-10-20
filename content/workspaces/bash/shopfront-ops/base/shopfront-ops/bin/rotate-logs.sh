#!/usr/bin/env bash
# Rotates taskapi's logs without losing a line: each log moves to LOG.1, older
# ones shift up and are gzipped (LOG.2.gz to LOG.KEEP.gz), then taskapi gets a
# HUP so it reopens fresh files. Empty or missing logs are left alone.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib/env.sh
source "$ROOT/bin/lib/env.sh"
load_env "$ROOT/.env" LOG_DIR

usage() {
  echo "usage: rotate-logs.sh [-k KEEP] [LOG...]   (default: api-access.log and app.log in \$LOG_DIR, keep 5)"
}

keep=5
while getopts ':k:h' opt; do
  case $opt in
    k) keep=$OPTARG ;;
    h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 64
      ;;
  esac
done
shift $((OPTIND - 1))

if [[ ! $keep =~ ^[1-9][0-9]*$ ]]; then
  echo "rotate-logs.sh: -k takes a whole number above 0" >&2
  exit 64
fi

cd -- "$ROOT"
logs=("$@")
if (( ${#logs[@]} == 0 )); then
  logs=("$LOG_DIR/api-access.log" "$LOG_DIR/app.log")
fi

rotated=0
for log in "${logs[@]}"; do
  if [[ ! -s $log ]]; then
    echo "skipped $log (empty or missing)"
    continue
  fi
  rm -f -- "$log.$keep.gz"
  for ((i = keep - 1; i >= 2; i--)); do
    if [[ -e $log.$i.gz ]]; then
      mv -- "$log.$i.gz" "$log.$((i + 1)).gz"
    fi
  done
  if [[ -e $log.1 ]]; then
    if (( keep >= 2 )); then
      mv -- "$log.1" "$log.2"
      gzip -f -- "$log.2"
    else
      rm -f -- "$log.1"
    fi
  fi
  mv -- "$log" "$log.1"
  rotated=$((rotated + 1))
  echo "rotated $log (keeping $keep)"
done

pidfile=run/taskapi.pid
if (( rotated > 0 )) && [[ -f $pidfile ]] && kill -0 "$(< "$pidfile")" 2> /dev/null; then
  kill -HUP "$(< "$pidfile")"
  echo "taskapi reopened its logs (HUP)"
fi
