# The hu/* images

The two images the runner's single-file runs use: `hu/node` for TypeScript
and `hu/bash` for Bash. The runner builds them locally from
`docker/<name>/Dockerfile` with this folder as the build context, natively
for the Mac (arm64 on Apple Silicon). Design: `architecture.md` §2.4 and
§11.2. Building needs the internet once. Running never does: a run has no
network at all. Each build's last step checks every pinned version, so a pin
that drifted fails the build.

```sh
npm run images                         # hu/node and hu/bash, when missing
npm run images -- bash --force         # rebuild one, even when its tag exists
npm run images:status                  # tags, states, sizes, and the kept previous tags
```

`npm run up` builds both (or only the one the courses you chose need).

## Tags

`hu/<name>:<sha12>` is the first 12 hex digits of SHA-256 over every file in
the image's input folders (its own folder and `shared/`), with paths and the
executable bit. So a change to a Dockerfile, or to anything in `shared/`,
rebuilds the image, and nothing else does.

The build that makes a new tag prunes the image's older tags, keeping the one
before it. Bases are pinned by digest and every download by SHA-256 (or by
its lockfile's integrity hashes).

## The images

Sizes are `docker images` sizes on this Mac (arm64), on 2026-10-20. A first
build is its wall time with nothing cached.

| Image | From | Size | First build | Runs |
| --- | --- | --- | --- | --- |
| `hu/node` | `node:26.12.0-trixie-slim` | 0.62 GB | about 1 min | The typescript recipe: Node 26.12.0 runs `main.ts` directly (type stripping) and TypeScript 7.0.2 checks it, with zod and `@types/node` (`node/ts/`) |
| `hu/bash` | `debian:trixie-slim` (13.7) | 0.55 GB | about 2 min | The bash recipe: Debian's GNU userland with Bash 5.3 (patch 20) and gawk 5.4.1 built from source, the static jq 1.8.2 and ShellCheck 0.11.0, and bats-core 1.14.0 |

Every image runs as `learner` (uid 1000, `HOME=/home/learner`, bash), sets
`LANG=C.UTF-8` and `TZ=UTC`, has git, curl, jq, less, nano, procps, and
tree, and has `hu-exec` (and whatever else `shared/bin` holds) in
`/opt/hu/bin`. A job's main process is `hu-exec --idle`, and each step of a
run is an exec through it (`shared/hu-exec.c`). Each image's `hu.versions`
label feeds the sandbox badge.

`shared/bin/hu-init`, the images' socat, `HOST=0.0.0.0`, and their
`/workspace` folder are from when workspaces ran in containers. They stay
until the images next change for another reason: any edit here changes both
tags, and every learner would rebuild both images for nothing.
