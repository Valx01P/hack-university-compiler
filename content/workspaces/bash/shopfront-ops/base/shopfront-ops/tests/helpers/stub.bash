# shellcheck shell=bash
# stub_command NAME BODY: puts a fake NAME first on PATH for the rest of the
# test. BODY is the script it runs, with the real arguments in "$@".
#
#   stub_command date 'echo 2026-10-19T09:00:00Z'
#   stub_command curl 'echo "$*" >> "$BATS_TEST_TMPDIR/curl.calls"; echo "{\"status\":\"ok\"}"'
stub_command() {
  local name=$1 body=$2 dir="$BATS_TEST_TMPDIR/stub-bin"
  mkdir -p "$dir"
  printf '#!/usr/bin/env bash\n%s\n' "$body" > "$dir/$name"
  chmod +x "$dir/$name"
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) PATH="$dir:$PATH" ;;
  esac
}
