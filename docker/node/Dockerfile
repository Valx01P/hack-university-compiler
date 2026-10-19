# hu/node: Node 26.12.0 runs TypeScript files directly (type stripping) and
# TypeScript 7.0.2 checks them. Used by the typescript recipe (single-file Run
# and Check) and, from P1, TypeScript workspaces.
#
# The runner builds it from the docker/ folder (npm run up, or
# npm run images -- node) and tags it hu/node:<sha12> of everything it copies,
# so it rebuilds only when this file or its inputs change.

# hu-exec is C, built static so it needs nothing in the final image.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f AS hu-exec
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
COPY shared/hu-exec.c /src/hu-exec.c
RUN gcc -O2 -Wall -Wextra -static -o /hu-exec /src/hu-exec.c

FROM node:26.12.0-trixie-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4

# What a workspace terminal expects, plus socat for the port bridge.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq less nano procps socat tree \
 && rm -rf /var/lib/apt/lists/*

# The base image's uid 1000 user is "node". Every hu image runs as learner.
RUN usermod --login learner --move-home --home /home/learner --shell /bin/bash node \
 && groupmod --new-name learner node

# npm 12 blocks dependency install scripts by default, the way templates are
# installed and verified.
RUN npm install --global npm@12.2.0 \
 && npm cache clean --force

# What a single-file program gets: tsc, @types/node, and zod. tsc is the native
# binary, called directly so a check skips a Node start. /node_modules points
# here, so a program in /work resolves zod, and tsc finds @types/node, by
# walking up, with nothing added to /work.
COPY node/ts/package.json node/ts/package-lock.json /opt/hu/ts/
RUN set -eu; \
    cd /opt/hu/ts; \
    npm ci --ignore-scripts --no-audit --no-fund; \
    npm cache clean --force; \
    case "$(dpkg --print-architecture)" in \
      arm64) platform=linux-arm64 ;; \
      amd64) platform=linux-x64 ;; \
      *) echo "hu/node has no tsc for $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    ln -s "/opt/hu/ts/node_modules/@typescript/typescript-$platform/lib/tsc" /usr/local/bin/tsc; \
    ln -s /opt/hu/ts/node_modules /node_modules

COPY --from=hu-exec /hu-exec /opt/hu/bin/hu-exec
COPY shared/bin/ /opt/hu/bin/
COPY node/stdio.mjs /opt/hu/node/stdio.mjs

# Mount points exist in the image and belong to learner, since a volume or
# tmpfs mounted on a missing path comes up owned by root.
RUN mkdir -p /work /workspace \
 && chown learner:learner /work /workspace

ENV HOME=/home/learner \
    HOST=0.0.0.0 \
    LANG=C.UTF-8 \
    TZ=UTC

# Fail the build if a pin drifted.
RUN test "$(node --version)" = v26.12.0 \
 && test "$(npm --version)" = 12.2.0 \
 && test "$(tsc --version)" = "Version 7.0.2" \
 && test "$(node -p 'require("/node_modules/zod/package.json").version')" = 4.6.7

WORKDIR /work
LABEL hu.versions="{\"node\":\"26.12.0\",\"typescript\":\"7.0.2\",\"npm\":\"12.2.0\"}"
