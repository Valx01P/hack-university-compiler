#!/usr/bin/env bash
# A report that takes a while (60 seconds unless -s says otherwise), for
# practicing job control: Ctrl-Z, bg, fg, jobs, nohup and disown. It writes
# its progress to reports/slow-report.txt.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

seconds=60
while getopts ':s:' opt; do
  case $opt in
    s) seconds=$OPTARG ;;
    *)
      echo "usage: slow-report.sh [-s SECONDS]" >&2
      exit 64
      ;;
  esac
done
if [[ ! $seconds =~ ^[0-9]+$ ]]; then
  echo "usage: slow-report.sh [-s SECONDS]" >&2
  exit 64
fi

out="$ROOT/reports/slow-report.txt"
mkdir -p -- "$ROOT/reports"
echo "building the slow report ($seconds seconds)..."
printf 'slow report, %s steps\n' "$seconds" > "$out"
for ((step = 1; step <= seconds; step++)); do
  sleep 1
  printf 'step %d of %d done\n' "$step" "$seconds" >> "$out"
done
echo "report written to reports/slow-report.txt"
