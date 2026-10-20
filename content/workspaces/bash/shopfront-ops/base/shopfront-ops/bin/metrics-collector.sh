#!/usr/bin/env bash
# Appends one line of system metrics per second to logs/metrics.log until it
# is stopped: the 1-minute load, available memory and the process count.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
out="$ROOT/logs/metrics.log"
mkdir -p -- "$ROOT/logs"

running=1
trap 'running=0' TERM INT

while ((running)); do
  read -r load1 _ < /proc/loadavg
  available_kb=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
  processes=$(find /proc -maxdepth 1 -name '[0-9]*' | wc -l)
  printf '%s load1=%s mem_available_mb=%d processes=%d\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$load1" "$((available_kb / 1024))" "$processes" >> "$out"
  sleep 1 &
  wait "$!" || true
done
