#!/usr/bin/env bats
# Tests for bin/report-sales.sh, on the small orders file in fixtures/.

bats_require_minimum_version 1.5.0

setup() {
  bats_load_library bats-support
  bats_load_library bats-assert
  cd "$BATS_TEST_DIRNAME/.." || return 1
  cp tests/fixtures/orders-small.csv "$BATS_TEST_TMPDIR/"
}

@test "-h prints the usage and exits 0" {
  run bin/report-sales.sh -h
  assert_success
  assert_line --index 0 "usage: report-sales.sh -d|-p [ORDERS_CSV]"
}

@test "a missing orders file is an error" {
  run bin/report-sales.sh -d "$BATS_TEST_TMPDIR/nope.csv"
  assert_failure 1
  assert_output "error: $BATS_TEST_TMPDIR/nope.csv not found"
}

# Still to write: -d and -p on the fixture, and a bad option (exit 64).
