#!/bin/sh
# fill-proxy.sh: runs while hu/go is built, with GOMODCACHE pointing at a
# scratch module cache whose download folder becomes the image's GOPROXY.
#
# The env module needs one set of versions: Go's minimal version selection
# picks, for each module, the newest version any requirement asks for. A
# learner's fresh module that needs only pgx picks older ones (pgx alone asks
# for an older golang.org/x/text). So beside the env module, each package
# deps.go names is also resolved in a module of its own. A module that needs
# several of them selects, for each dependency, the newest of their versions,
# which one of these single resolutions already downloaded.
set -eu
env=/opt/hu/env/go-api
(cd "$env" && go mod download && go mod tidy -diff && go build ./...)
sed -n 's/^[[:space:]]*_ "\(.*\)"$/\1/p' "$env/internal/deps/deps.go" | while read -r pkg; do
  version=$(cd "$env" && go list -f '{{.Module.Version}}' "$pkg")
  probe=$(mktemp -d)
  (
    cd "$probe"
    go mod init hu.local/probe > /dev/null 2>&1
    printf 'package main\n\nimport _ "%s"\n\nfunc main() {}\n' "$pkg" > main.go
    go get "$pkg@$version" > /dev/null 2>&1
    go mod tidy > /dev/null 2>&1
    go build -o /dev/null .
  )
  rm -rf "$probe"
done
# Every template's module, from the templates build context.
find /tmp/templates -name go.mod | sort | while read -r mod; do
  dir=$(dirname "$mod")
  echo "template module: ${dir#/tmp/templates/}"
  (cd "$dir" && go mod download)
done
