#!/usr/bin/env bash
# Checks that taskapi answers GET /health with a 2xx, retrying a few times.
# Prints "healthy" and exits 0, or "unhealthy after N attempts" and exits 1.
set -euo pipefail

usage() {
  cat <<'USAGE'
usage: healthcheck.sh [-r ATTEMPTS] [-t SECONDS] [-u URL]

  -r ATTEMPTS  how many times to try (default 3), one second apart
  -t SECONDS   time limit for each try (default 5)
  -u URL       the API's base URL (default $API_URL, or http://127.0.0.1:8080)
USAGE
}

attempts=3
timeout=5
url=${API_URL:-http://127.0.0.1:8080}

while getopts ':r:t:u:h' opt; do
  case $opt in
    r) attempts=$OPTARG ;;
    t) timeout=$OPTARG ;;
    u) url=$OPTARG ;;
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

if [[ ! $attempts =~ ^[1-9][0-9]*$ || ! $timeout =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "healthcheck.sh: -r takes a whole number above 0 and -t a number of seconds" >&2
  exit 64
fi

for ((try = 1; try <= attempts; try++)); do
  if curl -fsS --max-time "$timeout" "$url/health" > /dev/null; then
    echo healthy
    exit 0
  fi
  if ((try < attempts)); then
    sleep 1
  fi
done

echo "unhealthy after $attempts attempts"
exit 1
