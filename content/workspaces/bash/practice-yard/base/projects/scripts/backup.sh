#!/usr/bin/env bash
# Copies ~/notes into a dated folder under ~/backups, for example
# ~/backups/notes-2026-10-19.
set -euo pipefail

dest="$HOME/backups/notes-$(date +%F)"
mkdir -p "$dest"
cp -r "$HOME/notes/." "$dest/"
echo "backed up notes to $dest"
