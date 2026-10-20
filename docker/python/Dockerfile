# hu/python: Python 3.14.8 with uv 0.13.1 and an offline cache of every
# package the FastAPI course installs. Used by FastAPI workspaces and by the
# fastapi recipe.
#
# The runner builds it from the docker/ folder (Prepare this course, or
# npm run images -- --stacks=fastapi) and tags it hu/python:<sha12> of
# everything this file copies and every FastAPI template's uv.lock, so a new
# template lockfile rebuilds it.
#
#   /opt/hu/uv-cache            uv's cache: the wheels of python/env and of every
#                               template, and PyPI's index pages for them. uv
#                               reads it through /tmp/uv-cache, a writable view
#                               hu-uv-cache makes on first use
#   /opt/hu/env/fastapi/.venv   the baked venv a single-file program runs in
#                               (python main.py, the work folder beside it)
#   /opt/hu/python/hu_check.py  the pytest plugin checks load with -p hu_check
#
# UV_EXCLUDE_NEWER is the course's package snapshot, so uv add and uv lock in a
# workspace resolve to versions the cache holds. Template locks use the same
# instant (exclude-newer in pyproject.toml).

# hu-exec is C, built static so it needs nothing in the final image.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f AS hu-exec
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
COPY shared/hu-exec.c /src/hu-exec.c
RUN gcc -O2 -Wall -Wextra -static -o /hu-exec /src/hu-exec.c

FROM ghcr.io/astral-sh/uv:0.13.1@sha256:4a1f3666816dafadd20ceb71eac9a7d56d7ef30279f7d64048519ab901ada336 AS uv

FROM python:3.14.8-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170

# What a workspace terminal expects, plus socat for the port bridge and ss
# (iproute2) for finding what listens.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git iproute2 jq less nano procps socat tree \
 && rm -rf /var/lib/apt/lists/*

RUN --mount=type=bind,source=pgdg,target=/tmp/pgdg sh /tmp/pgdg/install-psql

RUN groupadd --gid 1000 learner \
 && useradd --uid 1000 --gid learner --create-home --home-dir /home/learner --shell /bin/bash learner

COPY --from=uv /uv /uvx /opt/hu/uv/

ENV UV_CACHE_DIR=/opt/hu/uv-cache \
    UV_EXCLUDE_NEWER=2026-10-19T17:00:00Z \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON_PREFERENCE=only-system

# The single-file venv holds the course's runtime packages. Syncing every
# group once more, into a throwaway venv, puts pytest, Ruff, and uv_build (for
# uv init --app) in the cache too, and a fresh lock against PyPI's index at the
# snapshot instant caches the index pages uv add and uv lock read offline.
COPY python/env/ /opt/hu/env/
RUN set -eu; \
    cd /opt/hu/env/fastapi; \
    /opt/hu/uv/uv sync --frozen --no-dev; \
    UV_PROJECT_ENVIRONMENT=/tmp/venv /opt/hu/uv/uv sync --frozen --all-groups; \
    mkdir /tmp/relock; \
    cp pyproject.toml .python-version /tmp/relock/; \
    (cd /tmp/relock && /opt/hu/uv/uv lock && cmp uv.lock /opt/hu/env/fastapi/uv.lock); \
    rm -rf /tmp/venv /tmp/relock; \
    mkdir /opt/hu/env/fastapi/work; \
    chown learner:learner /opt/hu/env/fastapi/work

# Every template's lockfile, from the templates build context the runner
# stages (content/workspaces/fastapi/**, beside its pyproject.toml).
COPY --from=templates . /tmp/templates/
RUN set -eu; \
    find /tmp/templates -name uv.lock | sort | while read -r lock; do \
      dir=$(dirname "$lock"); \
      echo "template lockfile: ${dir#/tmp/templates/}"; \
      (cd "$dir" && UV_PROJECT_ENVIRONMENT=/tmp/venv /opt/hu/uv/uv sync --frozen --all-groups --no-install-project); \
      rm -rf /tmp/venv; \
    done; \
    rm -rf /tmp/templates; \
    chmod -R a+rX /opt/hu/uv-cache

COPY --from=hu-exec /hu-exec /opt/hu/bin/hu-exec
COPY shared/bin/ /opt/hu/bin/
COPY python/bin/hu-uv-cache /opt/hu/bin/
COPY python/bin/uv python/bin/uvx /usr/local/bin/
COPY python/hu_check.py /opt/hu/python/

# Mount points exist in the image and belong to learner, since a volume or
# tmpfs mounted on a missing path comes up owned by root. /deps/venv holds a
# workspace's dependency volume (UV_PROJECT_ENVIRONMENT=/deps/venv).
RUN mkdir -p /work /workspace /deps/venv \
 && chown learner:learner /work /workspace /deps /deps/venv

ENV HOME=/home/learner \
    HOST=0.0.0.0 \
    LANG=C.UTF-8 \
    TZ=UTC \
    UV_CACHE_DIR=/tmp/uv-cache \
    UV_OFFLINE=1 \
    UV_NO_PROGRESS=1 \
    PYTHONPYCACHEPREFIX=/tmp/pycache \
    PYTHONUNBUFFERED=1

# Fail the build if a pin drifted, or if offline installs stopped working.
RUN --network=none \
    set -eu; \
    test "$(python3 --version)" = "Python 3.14.8"; \
    test "$(/opt/hu/uv/uv --version | cut -d' ' -f1-2)" = "uv 0.13.1"; \
    py=/opt/hu/env/fastapi/.venv/bin/python; \
    test "$($py -c 'import fastapi; print(fastapi.__version__)')" = 0.148.0; \
    test "$($py -c 'import sqlalchemy; print(sqlalchemy.__version__)')" = 2.1.5; \
    test "$($py -c 'import pydantic; print(pydantic.VERSION)')" = 2.14.1; \
    mkdir /tmp/check && chown learner:learner /tmp/check; \
    runuser -u learner -- sh -c 'cd /tmp/check \
      && uv init --quiet --app --no-package --no-workspace --python 3.14 api \
      && cd api && uv add --quiet "fastapi[standard-no-fastapi-cloud-cli]" sqlalchemy "psycopg[binary]" \
      && uv add --quiet --dev pytest httpx2 \
      && uv run python -c "import fastapi, sqlalchemy, psycopg, pytest; print(fastapi.__version__)"' | grep -qx 0.148.0; \
    rm -rf /tmp/check /tmp/uv-cache /tmp/pycache

WORKDIR /workspace
LABEL hu.versions="{\"python\":\"3.14.8\",\"uv\":\"0.13.1\",\"fastapi\":\"0.148.0\",\"pydantic\":\"2.14.1\",\"sqlalchemy\":\"2.1.5\",\"alembic\":\"1.20.0\",\"pytest\":\"9.1.1\",\"postgresClient\":\"18\"}"
