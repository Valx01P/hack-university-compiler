#!/usr/bin/env bash
# Archives data/ and config/ into $BACKUP_DIR/shopfront-<UTC timestamp>.tar.gz,
# appends the archive's checksum to $BACKUP_DIR/SHA256SUMS, verifies it, and
# prints the archive's path.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib/env.sh
source "$ROOT/bin/lib/env.sh"
load_env "$ROOT/.env" BACKUP_DIR

cd -- "$ROOT"
for dir in data config; do
  if [[ ! -d $dir ]]; then
    echo "error: $dir/ not found" >&2
    exit 1
  fi
done

mkdir -p -- "$BACKUP_DIR"
name="shopfront-$(date -u +%Y%m%d-%H%M%S).tar.gz"
archive="$BACKUP_DIR/$name"
if [[ -e $archive ]]; then
  echo "error: $archive already exists" >&2
  exit 1
fi

tar -czf "$archive.partial" data config
mv -- "$archive.partial" "$archive"

(
  cd -- "$BACKUP_DIR"
  sha256sum -- "$name" >> SHA256SUMS
  grep -F -- "  $name" SHA256SUMS | tail -n 1 | sha256sum --check --quiet -
)

echo "$archive"
