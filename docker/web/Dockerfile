# hu/web: hu/node plus everything the web, React, Next.js, and Express courses
# install, so their workspaces and single-file runs never need the network.
# Used by web projects, React workspaces, Next.js, and Express, and by the
# express and nextjs recipes.
#
# The runner builds it from the docker/ folder (Prepare this course, or
# npm run images -- --stacks=express) on top of the hu/node it built, and tags
# it hu/web:<sha12> of hu/node's tag, everything this file copies, and every
# web, React, Next.js, and Express template's package-lock.json, so a new
# template lockfile rebuilds it.
#
#   /opt/hu/npm-cache      the npm cache: the tarballs of every lockfile below
#                          and of every template, and metadata listing only
#                          those versions, so npm ci and npm install <name> both
#                          work offline. npm reads it through /tmp/npm-cache, a
#                          writable view hu-npm-cache makes on first use
#   /opt/hu/npm-sets/<s>/  the package.json and lockfile of each set it holds
#   /opt/hu/env/<course>/  express and nextjs: the baked node_modules a
#                          single-file program resolves. The recipe's tmpfs
#                          work folder is /opt/hu/env/<course>/work

ARG HU_BASE=hu/node
FROM ${HU_BASE}

# iproute2 gives ss, for finding what listens on a port.
RUN apt-get update \
 && apt-get install -y --no-install-recommends iproute2 \
 && rm -rf /var/lib/apt/lists/*

RUN --mount=type=bind,source=pgdg,target=/tmp/pgdg sh /tmp/pgdg/install-psql

# mongosh 2.13.0, MongoDB's own build for Debian's OpenSSL 3. Just the shell:
# the tarball's 97 MB client-side encryption library stays out.
ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) arch=arm64; sum=366aeec2c53078c9e257d38e7a1563254bc4260544298195b20b61154cd62f1b ;; \
      amd64) arch=x64; sum=37d626d88f6f2e5bebe8fae024a8beaa01bba77b0fd25b5a49344d755605d1c3 ;; \
      *) echo "hu/web has no mongosh pin for $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/mongosh.tgz "https://downloads.mongodb.com/compass/mongosh-2.13.0-linux-$arch-openssl3.tgz"; \
    echo "$sum  /tmp/mongosh.tgz" | sha256sum -c -; \
    tar -xzf /tmp/mongosh.tgz -C /tmp; \
    install -m 755 "/tmp/mongosh-2.13.0-linux-$arch-openssl3/bin/mongosh" /usr/local/bin/mongosh; \
    rm -rf /tmp/mongosh*

# The single-file environments: npm 12 blocks install scripts, as in every
# workspace, and each package here works without its own (argon2 and
# @node-rs/argon2 ship prebuilt binaries).
# Next.js scripts import next/server and never compile, so its optional SWC
# and sharp binaries (108 MB) stay out of the baked node_modules. They are in
# the cache for the templates.
COPY web/env/ /opt/hu/env/
RUN set -eu; \
    for env in /opt/hu/env/*/; do \
      omit=; \
      case "$env" in */nextjs/) omit=--omit=optional ;; esac; \
      (cd "$env" && npm ci $omit --ignore-scripts --no-audit --no-fund --cache /opt/hu/npm-cache); \
      mkdir "$env/work"; \
      chown learner:learner "$env/work"; \
    done

# Each set fills the cache once and leaves no node_modules behind.
COPY web/cache/ /opt/hu/npm-sets/
RUN set -eu; \
    for set in /opt/hu/npm-sets/*/; do \
      cp -R "$set" /tmp/set; \
      (cd /tmp/set && npm ci --ignore-scripts --no-audit --no-fund --cache /opt/hu/npm-cache > /dev/null); \
      rm -rf /tmp/set; \
    done

# Every template's lockfile, from the templates build context the runner
# stages (content/workspaces/{web,react,nextjs,express}/**, beside its
# package.json). A checkpoint overlay may change the lockfile alone, so a
# lockfile with no package.json beside it gets one written from its root entry.
COPY --from=templates . /tmp/templates/
RUN set -eu; \
    find /tmp/templates -name package-lock.json | sort | while read -r lock; do \
      dir=$(dirname "$lock"); \
      echo "template lockfile: ${dir#/tmp/templates/}"; \
      [ -f "$dir/package.json" ] || node -e ' \
        const root = require(process.argv[1]).packages[""]; \
        const keys = ["name", "version", "dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]; \
        require("fs").writeFileSync(process.argv[2], JSON.stringify(Object.fromEntries(keys.map((k) => [k, root[k]])))); \
      ' "$lock" "$dir/package.json"; \
      (cd "$dir" && npm ci --ignore-scripts --no-audit --no-fund --cache /opt/hu/npm-cache > /dev/null); \
      rm -rf "$dir/node_modules"; \
    done

RUN --mount=type=bind,source=web/npm-metadata.mjs,target=/tmp/npm-metadata.mjs \
    set -eu; \
    node /tmp/npm-metadata.mjs --cache /opt/hu/npm-cache \
      /opt/hu/env/*/package-lock.json /opt/hu/npm-sets/*/package-lock.json \
      $(find /tmp/templates -name package-lock.json); \
    rm -rf /tmp/templates /opt/hu/npm-cache/_logs /root/.npm; \
    chmod -R a+rX /opt/hu/npm-cache

COPY web/npmrc /usr/local/etc/npmrc
COPY web/bin/hu-npm-cache /opt/hu/bin/
RUN --mount=type=bind,source=web/bin,target=/tmp/web-bin \
    rm /usr/local/bin/npm /usr/local/bin/npx \
 && install -m 755 /tmp/web-bin/npm /tmp/web-bin/npx /usr/local/bin/

# hu/node's /node_modules holds the TypeScript sandbox's zod and types. Here
# it would let a template import a package its package.json forgot.
RUN rm /node_modules

# The folders a workspace mounts volumes on inside its /workspace: the
# dependency volume and the build volumes (template.json build). A bind mount
# hides them at run time, but Docker gives a new, empty volume the owner of
# the image's folder at its mount point, so these make the volumes learner's
# instead of root's.
RUN mkdir -p /workspace/node_modules /workspace/.next /workspace/dist /workspace/.vite-cache \
 && chown -R learner:learner /workspace

ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Fail the build if a pin drifted, or if offline installs stopped working.
RUN --network=none \
    set -eu; \
    v() { node -p "require('/opt/hu/env/$1/node_modules/$2/package.json').version"; }; \
    test "$(v express express)" = 5.3.0; \
    test "$(v express express4)" = 4.22.3; \
    test "$(v express mongoose)" = 9.11.2; \
    test "$(v express pg)" = 8.23.1; \
    test "$(v nextjs next)" = 16.4.2; \
    test "$(v nextjs react)" = 19.3.1; \
    test "$(v nextjs drizzle-orm)" = 0.45.4; \
    test "$(mongosh --version)" = 2.13.0; \
    cd /opt/hu/env/express && node -e "require('argon2'); require('bcryptjs')"; \
    cd /opt/hu/env/nextjs && node -e "require('next/server'); require('@electric-sql/pglite')"; \
    mkdir /tmp/check && cd /tmp/check; \
    echo '{"name":"check","version":"1.0.0","private":true}' > package.json; \
    chown -R learner:learner /tmp/check; \
    runuser -u learner -- env HOME=/tmp/check npm install --save-exact zod express@5.3.0 zustand vite@8.3.4 > /dev/null; \
    test "$(node -p "require('./node_modules/zod/package.json').version")" = 4.6.7; \
    cd / && rm -rf /tmp/check /tmp/npm-logs /tmp/npm-cache

WORKDIR /workspace
LABEL hu.versions="{\"node\":\"26.12.0\",\"npm\":\"12.2.0\",\"typescript\":\"7.0.2\",\"next\":\"16.4.2\",\"react\":\"19.3.1\",\"vite\":\"8.3.4\",\"vitest\":\"5.0.5\",\"express\":\"5.3.0\",\"postgresClient\":\"18\",\"mongosh\":\"2.13.0\"}"
