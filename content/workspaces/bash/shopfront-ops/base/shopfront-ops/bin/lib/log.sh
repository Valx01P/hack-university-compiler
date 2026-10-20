# shellcheck shell=bash
# Logging for the scripts in bin/: one line per call, with a UTC timestamp and
# a level. Lines go to stderr, so stdout stays free for a script's real
# output, or to the file LOG_FILE names when it is set (what background jobs
# such as worker.sh use).
#
#   log_info "backup started"    # 2026-10-19T09:00:00Z INFO backup started

log_line() {
  local level=$1 line
  shift
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $level $*"
  if [[ -n ${LOG_FILE:-} ]]; then
    printf '%s\n' "$line" >> "$LOG_FILE"
  else
    printf '%s\n' "$line" >&2
  fi
}

log_info() { log_line INFO "$@"; }
log_warn() { log_line WARN "$@"; }
log_error() { log_line ERROR "$@"; }
