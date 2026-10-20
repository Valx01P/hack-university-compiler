# FastAPI playground

A blank FastAPI project for trying things out: a one-file app, a scratch script, a test,
and an empty PostgreSQL database of your own. Every package the course uses is already
installed (FastAPI, Pydantic, pydantic-settings, SQLAlchemy with asyncio support, psycopg,
Alembic, PyJWT, pwdlib, pytest, httpx2, and Ruff), from the course's local package cache,
so nothing needs the internet.

## Run the server

```bash
uv run fastapi dev main.py --host 0.0.0.0 --port $PORT
```

Run does the same. The server prints the address it listens on, and reloads when you save
a `.py` file. `--host 0.0.0.0` lets the workspace's port reach it (the default,
`127.0.0.1`, only answers inside the container). Then try:

- the address it printed, in the Preview or a new tab: `{"message": "Hello, FastAPI!"}`
- `/docs` for Swagger UI, and `/redoc`, both generated from your routes
- `curl -s localhost:$PORT/` in a second terminal, and `curl --json '{"name": "Ada"}' localhost:$PORT/...` for JSON bodies
- the HTTP tab, which sends the requests in `requests.http`

## Run a script

`scratch.py` connects to your database and prints its version:

```bash
uv run python scratch.py
```

Change it freely: it is the place for SQLAlchemy experiments that need no server.

## Use the database

`DATABASE_URL` in `.env` names your own database (the environment's value wins when both
are set). SQLAlchemy reads the `postgresql+psycopg://` form, which picks the psycopg 3
driver. `psql` wants plain `postgresql://`, so in the terminal:

```bash
psql "${DATABASE_URL/+psycopg/}"        # \dt lists tables, \d name describes one, \q quits
```

The Database tab shows the same tables without typing SQL.

## Run the tests

```bash
uv run pytest            # every test_*.py file
uv run pytest -k hello   # only tests whose names match
```

`test_main.py` calls the app in the same process through `TestClient`, so tests need no
running server.

## Packages and Python

- `pyproject.toml` lists the packages, each pinned to one version, and `uv.lock` pins every
  package beneath them. `uv add <name>` and `uv remove <name>` change both, and work only
  for packages in the local cache.
- `.python-version` pins Python 3.14. uv 0.13 would otherwise pick 3.15, which parts of
  this stack do not support yet.
- `uv run` runs a command inside the project's environment, syncing it first if needed.
- `uv run ruff check` and `uv run ruff format` lint and format the code.
