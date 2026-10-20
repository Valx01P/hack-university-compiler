#!/usr/bin/env bash
# Creates a taskapi user from flags and prints the new user's id.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib/env.sh
source "$ROOT/bin/lib/env.sh"
# shellcheck source=lib/http.sh
source "$ROOT/bin/lib/http.sh"
load_env "$ROOT/.env" API_URL API_TOKEN

usage() {
  echo "usage: new-user.sh -n NAME -e EMAIL [-r admin|editor|viewer]"
}

name="" email="" role=viewer
while getopts ':n:e:r:h' opt; do
  case $opt in
    n) name=$OPTARG ;;
    e) email=$OPTARG ;;
    r) role=$OPTARG ;;
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

if [[ -z $name || -z $email ]]; then
  usage >&2
  exit 64
fi

body=$(jq -n --arg name "$name" --arg email "$email" --arg role "$role" '{name: $name, email: $email, role: $role}')
if ! response=$(api_post /users "$body"); then
  message=$(jq -r 'if .fields then "\(.error): " + ([.fields | to_entries[] | "\(.key) \(.value)"] | join(", ")) else .error end' <<< "$response" 2> /dev/null || printf '%s' "$response")
  echo "error: ${message:-no answer from $API_URL}" >&2
  exit 1
fi
jq -r .id <<< "$response"
