#!/usr/bin/env bash
# Pretends to ping HOST, so the parallel checks practice has something slow to
# run: it waits FAKE_PING_DELAY seconds (default 1), then prints a reply and
# exits 0, or prints "no reply" and exits 1 when HOST is one of the
# space-separated names in FAKE_PING_DOWN (default: db-2.shop.internal).
set -euo pipefail

if (( $# != 1 )); then
  echo "usage: fake-ping.sh HOST" >&2
  exit 64
fi
host=$1
delay=${FAKE_PING_DELAY:-1}
down=" ${FAKE_PING_DOWN-db-2.shop.internal} "

sleep "$delay"
if [[ $down == *" $host "* ]]; then
  echo "PING $host: no reply"
  exit 1
fi
echo "PING $host: reply in ${delay}s"
