# FastAPI workspace dependencies

Every Python package the FastAPI course's workspace templates install, at the exact version
their `uv.lock` files pin, for the `hu/python` image's offline uv cache (PLAN.md D5 and 9.3,
architecture 2.4 and 4.4, outlines/fastapi.md sections 1 and 9). Workspaces have no network:
`uv sync --frozen --offline` installs from the cache, and `uv add` works only for what the
cache holds.

## Direct dependencies

Every `pyproject.toml` pins exact versions (`==`), and each `uv.lock` pins the rest of the
tree with hashes. Both templates resolve to the same versions, so one cache serves both.

| Package | Version | Templates | Notes |
| --- | --- | --- | --- |
| Python | 3.14.8 | both (the image, `python:3.14.8-slim-trixie`) | `.python-version` says `3.14` and `requires-python = ">=3.14"`, because uv 0.13 defaults to 3.15 |
| uv | 0.13.1 | both (the image, `COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /uvx`) | Locks are `version = 1`, `revision = 5` |
| `fastapi[standard-no-fastapi-cloud-cli]` | 0.148.0 | both | Architecture 2.4 and PLAN.md B.1 (the outline's table still says 0.146.0). The extra brings fastapi-cli 0.0.32, uvicorn[standard] 0.54.0, starlette 1.9.0, httpx2 2.14.0, httpx 0.28.1, jinja2, python-multipart, email-validator, pydantic-settings, pydantic-extra-types, and the OpenTelemetry SDK and OTLP exporter (1.45.1) |
| `pydantic` | 2.14.1 | both | pydantic-core 2.50.1 |
| `pydantic-settings` | 2.16.0 | both | |
| `sqlalchemy` | 2.1.5 | taskboard-api | |
| `sqlalchemy[asyncio]` | 2.1.5 | fastapi-playground | Adds greenlet 3.5.6, which SQLAlchemy 2.1 installs only with this extra |
| `psycopg[binary]` | 3.3.6 | both | psycopg-binary 3.3.6, the only PostgreSQL driver the course uses |
| `alembic` | 1.20.0 | both | Config in `[tool.alembic]` (the pyproject template), logging in `alembic.ini` |
| `pyjwt` | 2.15.1 | both | |
| `pwdlib[argon2]` | 0.3.1 | both | argon2-cffi 25.1.0, argon2-cffi-bindings 26.1.0 |
| `pytest` | 9.1.1 | both (dev group) | Configured in `[tool.pytest]` with `strict = true` |
| `httpx2` | 2.14.0 | both (dev group) | TestClient is an httpx2 client. PyPI has 2.15.1 now, so the pin matters |
| `ruff` | 0.17.1 | both (dev group) | `ruff check` is the template's diagnostics command |

PyPI has moved on since the plan was written (FastAPI 0.150.0, httpx2 2.15.1, and uv 0.13.2
on 2026-10-19), so every image and lock must use the exact pins above, never "latest".

## Every locked package

73 packages: 72 in both locks, plus greenlet in the playground's. Every one has a
pure-Python wheel or manylinux wheels for CPython 3.14 on both aarch64 and x86_64, so the
image never builds from source and needs no compiler.

```text
alembic==1.20.0
annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.15.1
argon2-cffi==25.1.0
argon2-cffi-bindings==26.1.0
certifi==2026.10.18
cffi==2.1.1
charset-normalizer==3.5.2
click==8.5.0
colorama==0.4.6
dnspython==2.9.0
email-validator==2.3.0
fastapi==0.148.0
fastapi-cli==0.0.32
googleapis-common-protos==1.75.5
greenlet==3.5.6 (fastapi-playground only)
h11==0.16.0
httpcore==1.0.9
httpcore2==2.14.0
httptools==0.9.0
httpx==0.28.1
httpx2==2.14.0
httpx2-jsfetch==1.0
idna==3.20
iniconfig==2.3.1
jinja2==3.1.6
mako==1.4.3
markdown-it-py==4.2.0
markupsafe==3.0.4
mdurl==0.1.2
opentelemetry-api==1.45.1
opentelemetry-exporter-http-transport==0.66b1
opentelemetry-exporter-otlp-common==0.66b1
opentelemetry-exporter-otlp-proto-common==1.45.1
opentelemetry-exporter-otlp-proto-http==1.45.1
opentelemetry-proto==1.45.1
opentelemetry-sdk==1.45.1
opentelemetry-semantic-conventions==0.66b1
packaging==26.3
pluggy==1.7.0
protobuf==7.36.2
psycopg==3.3.6
psycopg-binary==3.3.6
pwdlib==0.3.1
pycparser==3.11
pydantic==2.14.1
pydantic-core==2.50.1
pydantic-extra-types==2.11.1
pydantic-settings==2.16.0
pygments==2.21.0
pyjwt==2.15.1
pytest==9.1.1
python-dotenv==1.2.4
python-multipart==0.0.32
pyyaml==6.0.3
requests==2.34.2
rich==15.0.0
rich-toolkit==0.20.6
ruff==0.17.1
shellingham==1.5.4
sqlalchemy==2.1.5
starlette==1.9.0
truststore==0.10.5
typer==0.27.3
typing-extensions==4.16.0
typing-inspection==0.4.4
tzdata==2026.5
urllib3==2.8.0
uvicorn==0.54.0
uvloop==0.23.0
watchfiles==1.3.0
websockets==17.3
```

## Filling the cache

`uv sync` downloads, so it runs while the image is built, once per lockfile:

```sh
for template in fastapi-playground taskboard-api; do
  (cd "content/workspaces/fastapi/$template/base" && \
   UV_CACHE_DIR=/opt/hu/uv-cache UV_PROJECT_ENVIRONMENT=/tmp/venv-$template uv sync --frozen)
done
```

Locking (`uv lock`) as well as syncing also stores the index metadata, which offline
`uv add` needs. Both templates' caches together took 149 MB here (wheels, unpacked
archives, and metadata).

## What works offline

Tested with `--network none`, uv 0.13.1 in `python:3.14.8-slim-trixie`, and a cache filled
as above:

| Command | Result |
| --- | --- |
| `uv sync --locked` and `uv sync --frozen` for both templates | Install from the cache |
| `uv lock --check --offline` | Passes for both |
| `uv init --app --no-package --python 3.14 --no-workspace catalog`, then `uv add "sqlalchemy==2.1.5" "psycopg[binary]==3.3.6"` and `uv add --dev "pytest==9.1.1"` | Works (lesson 13) |
| `uv add fastapi httpx2`, with no versions | Works, and picks the cached 0.148.0 and 2.14.0 even though the cached index lists newer ones |

**The cache must be writable.** uv 0.13.1 takes a lock file inside `UV_CACHE_DIR` before it
reads anything, so a read-only cache fails every command with `Could not acquire lock ...
Read-only file system`. With the workspace's read-only root file system, either copy the
baked cache to a writable volume when a workspace is created (`cp -a`, 149 MB), or mount a
writable layer over it. `UV_LINK_MODE=copy` (or `symlink`) is needed when the cache and the
environment sit on different file systems.

## What the runner sets

- `DATABASE_URL` and `TEST_DATABASE_URL` as environment variables (they win over `.env`),
  in SQLAlchemy's psycopg form, `postgresql+psycopg://ws_<id>:<password>@db:5432/ws_<id>`
  and `.../ws_<id>_test`. The test database's name must end in `test`: taskboard's
  `tests/conftest.py` refuses any other, because it empties the test database first.
- `PORT` (and `WEB_PORT` for taskboard's board page), `HU_FIXED_TIME=2026-10-01T09:00:00Z`.
- `UV_OFFLINE=1`, `UV_PYTHON_DOWNLOADS=never`, and, for a shared read-only environment,
  `UV_PROJECT_ENVIRONMENT=/deps/venv` with `UV_FROZEN=1` (or `UV_NO_SYNC=1`), so `uv run`
  never tries to write to it. `PYTHONPYCACHEPREFIX=/tmp/pycache` keeps `__pycache__` out of
  the workspace.
- taskboard's template database: `uv run --frozen alembic upgrade head && uv run --frozen
  python -m scripts.seed` (template.json `services.postgres.build`). Its test twin needs
  only the schema, and the tests migrate and empty it themselves.
