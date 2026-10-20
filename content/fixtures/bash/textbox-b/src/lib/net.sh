# shellcheck shell=bash
# Network helpers. Source it, don't run it.

# TODO: retry on connection errors
fetch() {
  curl -fsS --max-time 5 "$1"
}
