#!/usr/bin/env bash
# Prints the users.csv row for one user id.
set -euo pipefail

id="${1:?usage: users.sh ID}"
if [[ ! $id =~ ^[0-9]+$ ]]; then
  echo "not a valid id: $id" >&2
  exit 64
fi
# TODO: look users up by email as well as by user_id
grep "^$id," users.csv
