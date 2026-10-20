# hu/go: Go 1.27.2 with a file module proxy of every module the Go APIs course
# uses, sqlc, goose, gotestsum, golangci-lint, air, and a warm build cache.
# Used by Go API workspaces and by the go recipe.
#
# The runner builds it from the docker/ folder (Prepare this course, or
# npm run images -- --stacks=go-api) and tags it hu/go:<sha12> of everything
# this file copies and every Go API template's go.mod and go.sum, so a new
# template module rebuilds it.
#
#   /opt/hu/goproxy          GOPROXY=file:///opt/hu/goproxy,off: the zips and
#                            go.mod files of go/env and of every template,
#                            read-only, so go get of one of them works and
#                            anything else fails at once
#   /opt/hu/go-build/mod     GOMODCACHE and GOCACHE. The runner mounts the shared
#   /opt/hu/go-build/cache   hu-go-build volume on /opt/hu/go-build, and Docker
#                            seeds a new volume from here: the course's modules
#                            unpacked and the standard library and those modules
#                            compiled, so a first build takes a fraction of a
#                            second instead of seconds
#   /opt/hu/env/go-api/      the module a single-file program builds in
#                            (main.go in its work folder)

# hu-exec is C, built static so it needs nothing in the final image.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f AS hu-exec
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
COPY shared/hu-exec.c /src/hu-exec.c
RUN gcc -O2 -Wall -Wextra -static -o /hu-exec /src/hu-exec.c

FROM golang:1.27.2-trixie@sha256:47667934874913a449b96faa7ef4777fa285d9ec29126ee80ed61c45b7cccf0e

# What a workspace terminal expects, plus socat for the port bridge and ss
# (iproute2) for finding what listens. The image already has git, curl, gcc,
# and make (the race detector needs gcc).
RUN apt-get update \
 && apt-get install -y --no-install-recommends file iproute2 jq less nano procps socat tree \
 && rm -rf /var/lib/apt/lists/*

RUN --mount=type=bind,source=pgdg,target=/tmp/pgdg sh /tmp/pgdg/install-psql

RUN groupadd --gid 1000 learner \
 && useradd --uid 1000 --gid learner --create-home --home-dir /home/learner --shell /bin/bash learner

# Release binaries, each pinned by SHA-256.
ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) a=arm64; x=arm64; \
             sqlc=b7cae247740d0c51a1e657479e5b2d21e6fef428f596682a01bc55bf4ab8a23d; \
             goose=efdb8f97176df746cf3970ed40810816a51927da0600b152ac4359ae2b7c0e12; \
             gotestsum=7644a4c5cd1bb978d56245aeab25a586ac5ac62adebed20a399548867c13499d; \
             lint=b4d8f17068b35ee6060cc2f69a16fb48740d706fbba81661c318649c114a6998 ;; \
      amd64) a=amd64; x=x86_64; \
             sqlc=497ae4fcdfa64c5b0c311ffe4c2bd991e43991e82e5367792ed78bc2dca27354; \
             goose=cc56e2f75532a4dd52f5ef2d31db0121e91079a9c2617bc0ad4e04e2d41c228b; \
             gotestsum=11ccddeaf708ef228889f9fe2f68291a75b27013ddfc3b18156e094f5f40e8ee; \
             lint=9b7fe6a6bf6334b98decf8d86b11415ea7889afdabdd1959fdce23af2a9ebcea ;; \
      *) echo "hu/go has no tool pins for $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    gh=https://github.com; \
    curl -fsSL -o sqlc.tgz "$gh/sqlc-dev/sqlc/releases/download/v1.31.1/sqlc_1.31.1_linux_$a.tar.gz"; \
    echo "$sqlc  sqlc.tgz" | sha256sum -c -; \
    tar -xzf sqlc.tgz sqlc; \
    curl -fsSL -o goose "$gh/pressly/goose/releases/download/v3.29.0/goose_linux_$x"; \
    echo "$goose  goose" | sha256sum -c -; \
    curl -fsSL -o gotestsum.tgz "$gh/gotestyourself/gotestsum/releases/download/v1.13.0/gotestsum_1.13.0_linux_$a.tar.gz"; \
    echo "$gotestsum  gotestsum.tgz" | sha256sum -c -; \
    tar -xzf gotestsum.tgz gotestsum; \
    curl -fsSL -o lint.tgz "$gh/golangci/golangci-lint/releases/download/v2.15.0/golangci-lint-2.15.0-linux-$a.tar.gz"; \
    echo "$lint  lint.tgz" | sha256sum -c -; \
    tar -xzf lint.tgz --strip-components=1 "golangci-lint-2.15.0-linux-$a/golangci-lint"; \
    install -m 755 sqlc goose gotestsum golangci-lint /usr/local/bin/; \
    rm -rf /tmp/*

ENV GOTOOLCHAIN=local \
    GOTELEMETRY=off \
    GOFLAGS=-mod=mod \
    CGO_ENABLED=1

# The module proxy: everything go mod tidy, go build, and go test need for
# go/env, for each of its packages alone, and for every template, downloaded
# (and checked against sum.golang.org) into a scratch module cache, whose
# download folder is a GOPROXY as it is. Tools installed from source come from
# the internet and stay out of it.
COPY go/env/ /opt/hu/env/
COPY --from=templates . /tmp/templates/
RUN --mount=type=bind,source=go/fill-proxy.sh,target=/tmp/fill-proxy.sh \
    set -eu; \
    export GOMODCACHE=/tmp/modcache GOCACHE=/tmp/gocache; \
    sh /tmp/fill-proxy.sh; \
    cp -R /tmp/modcache/cache/download /opt/hu/goproxy; \
    rm -rf /opt/hu/goproxy/sumdb /tmp/templates; \
    GOBIN=/usr/local/bin go install github.com/air-verse/air@v1.67.4; \
    GOBIN=/usr/local/bin go install github.com/rakyll/hey@v0.1.5; \
    (cd /opt/hu/env/go-api && GOBIN=/usr/local/bin go install golang.org/x/tools/cmd/goimports golang.org/x/tools/cmd/stringer); \
    chmod -R a+rX /opt/hu/goproxy; \
    go clean -modcache; \
    rm -rf /tmp/modcache /tmp/gocache

# The seed for the hu-go-build volume, filled from the proxy alone: the
# modules a build unpacks, and the build cache warmed by compiling (and
# vetting, and testing) a program that imports what the course's APIs import.
ENV GOPROXY=file:///opt/hu/goproxy,off \
    GOSUMDB=off \
    GOMODCACHE=/opt/hu/go-build/mod \
    GOCACHE=/opt/hu/go-build/cache
RUN --mount=type=bind,source=go/warm,target=/tmp/warm-src \
    set -eu; \
    mkdir -p /tmp/warm/warm; \
    cp /opt/hu/env/go-api/go.mod /opt/hu/env/go-api/go.sum /tmp/warm/; \
    cp /tmp/warm-src/*.go /tmp/warm/warm/; \
    cd /tmp/warm; \
    go build -o /dev/null ./warm; \
    go vet ./warm; \
    go test -count=1 ./warm; \
    (cd /opt/hu/env/go-api && go build ./...); \
    rm -rf /tmp/warm; \
    mkdir -p /opt/hu/env/go-api/work; \
    chown -R learner:learner /opt/hu/go-build /opt/hu/env/go-api/work

COPY --from=hu-exec /hu-exec /opt/hu/bin/hu-exec
COPY shared/bin/ /opt/hu/bin/

# Mount points exist in the image and belong to learner, since a volume or
# tmpfs mounted on a missing path comes up owned by root.
RUN mkdir -p /work /workspace \
 && chown learner:learner /work /workspace

ENV HOME=/home/learner \
    GOPATH=/home/learner/go \
    PATH=/home/learner/go/bin:/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HOST=0.0.0.0 \
    LANG=C.UTF-8 \
    TZ=UTC

# Fail the build if a pin drifted, or if the module proxy stopped working.
RUN --network=none \
    set -eu; \
    test "$(go env GOVERSION)" = go1.27.2; \
    sqlc version | grep -qx v1.31.1; \
    goose --version | grep -q 'v3\.29\.0'; \
    gotestsum --version | grep -q '1\.13\.0'; \
    golangci-lint version | grep -q 'version 2\.15\.0'; \
    command -v air hey goimports stringer > /dev/null; \
    mkdir -p /tmp/check && chown learner:learner /tmp/check; \
    runuser -u learner -- sh -c 'export GOMODCACHE=/tmp/check/mod GOCACHE=/tmp/check/cache; \
      mkdir /tmp/check/app && cd /tmp/check/app \
      && go mod init example.com/app > /dev/null 2>&1 \
      && printf "package main\nimport (\n\"fmt\"\n\"github.com/jackc/pgx/v5\"\n)\nfunc main() { fmt.Println(pgx.TextFormatCode) }\n" > main.go \
      && go get github.com/jackc/pgx/v5@v5.11.0 > /dev/null 2>&1 && go run .' | grep -qx 0; \
    rm -rf /tmp/check

WORKDIR /workspace
LABEL hu.versions="{\"go\":\"1.27.2\",\"pgx\":\"5.11.0\",\"sqlc\":\"1.31.1\",\"goose\":\"3.29.0\",\"gotestsum\":\"1.13.0\",\"golangciLint\":\"2.15.0\",\"air\":\"1.67.4\",\"postgresClient\":\"18\"}"
