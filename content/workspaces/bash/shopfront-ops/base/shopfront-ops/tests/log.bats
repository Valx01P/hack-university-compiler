#!/usr/bin/env bats
# Tests for bin/lib/log.sh. The date stub makes every timestamp the same.

bats_require_minimum_version 1.5.0

setup() {
  bats_load_library bats-support
  bats_load_library bats-assert
  load 'helpers/stub'
  # shellcheck source=../bin/lib/log.sh
  source "$BATS_TEST_DIRNAME/../bin/lib/log.sh"
  stub_command date 'echo 2026-10-19T09:00:00Z'
  unset LOG_FILE
}

@test "log_info writes a timestamped INFO line to stderr, and nothing to stdout" {
  run --separate-stderr log_info "backup started"
  assert_success
  assert_output ""
  assert_equal "$stderr" "2026-10-19T09:00:00Z INFO backup started"
}

@test "log_warn and log_error use their own level" {
  run --separate-stderr log_warn "disk at 85%"
  assert_equal "$stderr" "2026-10-19T09:00:00Z WARN disk at 85%"
  run --separate-stderr log_error "disk full"
  assert_equal "$stderr" "2026-10-19T09:00:00Z ERROR disk full"
}

@test "with LOG_FILE set, lines are appended to that file instead" {
  LOG_FILE="$BATS_TEST_TMPDIR/app.log"
  log_info "first"
  run --separate-stderr log_error "second"
  assert_equal "$stderr" ""
  run cat "$LOG_FILE"
  assert_output "$(printf '%s\n' '2026-10-19T09:00:00Z INFO first' '2026-10-19T09:00:00Z ERROR second')"
}
