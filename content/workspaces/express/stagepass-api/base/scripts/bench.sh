#!/bin/sh
# npm run bench: 20 connections for 5 seconds against the running server (npm run dev).
# Pass another path to measure it instead: npm run bench -- /v1/events?q=jazz
# The API allows 300 requests a minute per address, so turn that limit off first, or most
# answers are 429s: put API_RATE_LIMIT_PER_MINUTE=0 in .env and restart the server.
set -eu
path="${1:-/v1/events}"
exec npx --no-install autocannon --connections 20 --duration 5 "http://localhost:${PORT:-3000}${path}"
