#!/usr/bin/env bash
# Copies the build into release/ and stamps it with the version.
set -euo pipefail

version="$(< build/VERSION)"
mkdir -p release
cp build/index.html build/app.js build/app.css release/
printf '%s\n' "$version" > release/STAMP
echo "deployed shopfront $version"
