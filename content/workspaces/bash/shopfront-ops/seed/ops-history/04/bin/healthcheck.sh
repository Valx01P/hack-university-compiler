#!/usr/bin/env bash
# Checks that taskapi answers GET /health with a 2xx: prints "healthy" and
# exits 0, or prints "unhealthy" and exits 1.
set -euo pipefail

url=${API_URL:-http://127.0.0.1:8080}
if curl -fsS --max-time 5 "$url/health" > /dev/null; then
  echo healthy
else
  echo unhealthy
  exit 1
fi
