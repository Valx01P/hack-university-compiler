# syntax=docker/dockerfile:1
# Taskboard's production image, in two stages: the first installs the locked packages with
# uv, the second copies only the app and its virtual environment, so the image ships no uv,
# no build cache, no tests, and no dev tools. It runs as a non-root user.
#
#   docker build -t taskboard-api .
#   docker compose up            (the API, PostgreSQL, and a migrate step: see compose.yaml)

FROM python:3.14.8-slim-trixie AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app

# The packages first, from the lockfile alone, so this layer stays cached until uv.lock changes.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

FROM python:3.14.8-slim-trixie
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home app
WORKDIR /app
COPY --from=build --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production
USER app
EXPOSE 8000

# Behind a reverse proxy, --proxy-headers makes request.url use the client's scheme and
# address from X-Forwarded-*. Run `alembic upgrade head` before starting a new version.
CMD ["fastapi", "run", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
