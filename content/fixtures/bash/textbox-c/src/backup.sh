#!/usr/bin/env bash
# Nightly backup of the shop database.
set -euo pipefail

backup_id="$(date -u +%Y%m%d)"
target="/srv/backups/shop-${backup_id}.sql.gz"

# TODO: read the database name from config.ini
pg_dump shop | gzip > "$target"
# TODO: delete backups older than 14 days
echo "backup written to $target"
