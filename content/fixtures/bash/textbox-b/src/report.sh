#!/usr/bin/env bash
# Prints yesterday's orders for one store id.
set -euo pipefail

store_id="${1:?usage: report.sh STORE_ID}"
# TODO: take the date as an option
day="$(date -u -d yesterday +%F)"
grep ",$store_id,$day," orders.csv
