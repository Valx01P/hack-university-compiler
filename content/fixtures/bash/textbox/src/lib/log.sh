# shellcheck shell=bash
# Logging helpers for the shop scripts. Source it, don't run it.

log() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2
}

# TODO: add log levels and hide debug lines by default
