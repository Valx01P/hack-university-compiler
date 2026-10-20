#!/usr/bin/env bash
# Copies the product images to the CDN folder.
set -euo pipefail

src="${1:-images}"
# TODO: stop deleting files on the CDN side
rsync -a --delete "$src/" /srv/cdn/images/
echo "synced $src"
