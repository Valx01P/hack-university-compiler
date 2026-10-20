#!/usr/bin/env bash
# Waits until the database in DATABASE_URL accepts connections, for up to 30 seconds,
# so `make migrate-up` right after starting PostgreSQL does not fail on the first try.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL first}"
for _ in $(seq 1 30); do
  if pg_isready --quiet --dbname="$DATABASE_URL"; then
    exit 0
  fi
  sleep 1
done
echo "wait-for-db: the database at DATABASE_URL did not answer within 30 seconds" >&2
exit 1
