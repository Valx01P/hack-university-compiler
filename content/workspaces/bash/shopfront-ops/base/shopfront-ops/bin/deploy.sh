#!/usr/bin/env bash
# Deploys a tagged version of taskapi: builds releases/<UTC time>-<VERSION>
# from the app repo, switches releases/current to it atomically, restarts the
# API and checks /health. A failed check switches back to the previous
# release and exits 1. Keeps the newest 5 releases.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib/env.sh
source "$ROOT/bin/lib/env.sh"
load_env "$ROOT/.env" API_URL LOG_DIR

APP_REPO=${APP_REPO:-/srv/git/shopfront.git}
RELEASES="$ROOT/releases"
KEEP_RELEASES=5
DEPLOY_LOG="$ROOT/$LOG_DIR/deploy.log"

usage() {
  cat <<'USAGE'
usage: deploy.sh [--dry-run] VERSION

  VERSION    a tag in the app repo, for example v2.14.1 (git ls-remote --tags /srv/git/shopfront.git)
  --dry-run  print the plan and change nothing
USAGE
}

dry_run=false
version=""
for arg in "$@"; do
  case $arg in
    -n | --dry-run) dry_run=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      usage >&2
      exit 64
      ;;
    *)
      if [[ -n $version ]]; then
        usage >&2
        exit 64
      fi
      version=$arg
      ;;
  esac
done
if [[ -z $version ]]; then
  usage >&2
  exit 64
fi

say() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  echo "$line"
  if [[ $dry_run == false ]]; then
    mkdir -p -- "$(dirname -- "$DEPLOY_LOG")"
    echo "$line" >> "$DEPLOY_LOG"
  fi
}

if ! revision=$(git -C "$APP_REPO" rev-parse --verify --quiet --short "refs/tags/$version^{commit}"); then
  echo "unknown version: $version" >&2
  exit 1
fi

mkdir -p -- "$ROOT/run"
exec 9> "$ROOT/run/deploy.lock"
if ! flock -n 9; then
  echo "another deploy is running (run/deploy.lock)" >&2
  exit 1
fi

name="$(date -u +%Y-%m-%dT%H%M)-$version"
previous=$(readlink "$RELEASES/current" || true)

if [[ $dry_run == true ]]; then
  echo "would build releases/$name from $version (revision $revision)"
  echo "would switch releases/current from ${previous:-nothing} to $name"
  echo "would restart taskapi and check /health (3 attempts), rolling back to ${previous:-nothing} if it fails"
  exit 0
fi

switch_to() {
  ln -sfn -- "$1" "$RELEASES/current.tmp"
  mv -T -- "$RELEASES/current.tmp" "$RELEASES/current"
}

if [[ -d $RELEASES/$name ]]; then
  say "release $name already exists, reusing it"
else
  rm -rf -- "$RELEASES/$name.partial"
  mkdir -p -- "$RELEASES/$name.partial"
  git -C "$APP_REPO" archive "$version" | tar -x -C "$RELEASES/$name.partial"
  echo "$revision" > "$RELEASES/$name.partial/REVISION"
  mv -- "$RELEASES/$name.partial" "$RELEASES/$name"
  say "built releases/$name (revision $revision)"
fi

switch_to "$name"
say "switched current to $name"

# 9>&- keeps the lock out of the restarted API, which would otherwise hold it forever.
if "$ROOT/bin/taskapictl" restart 9>&- && "$ROOT/bin/healthcheck.sh" -r 3 -t 2; then
  say "deployed $version"
else
  say "health check failed for $version"
  if [[ -n $previous ]]; then
    switch_to "$previous"
    "$ROOT/bin/taskapictl" restart 9>&- || true
    say "rolled back to $previous"
  fi
  exit 1
fi

mapfile -t all < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '*.partial' -printf '%f\n' | sort)
for old in "${all[@]:0:$(( ${#all[@]} > KEEP_RELEASES ? ${#all[@]} - KEEP_RELEASES : 0 ))}"; do
  if [[ $old != "$name" && $old != "$previous" ]]; then
    rm -rf -- "${RELEASES:?}/$old"
    say "removed old release $old"
  fi
done
