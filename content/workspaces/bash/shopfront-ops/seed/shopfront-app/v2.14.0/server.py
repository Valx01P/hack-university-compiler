#!/usr/bin/env python3
"""taskapi: the shop team's small JSON API for users, orders and tasks.

Only the standard library: http.server, sqlite3 and json. Run it from the
ops repo with bin/taskapictl, or by hand:

    python3 releases/current/server.py --port 8080 --db data/shop.db --log-dir logs

It writes an access log (the combined format plus the request time) and an
app log (JSON lines), reopens both on SIGHUP, and on SIGTERM stops accepting
connections, finishes the requests in flight, and exits 0.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import signal
import sqlite3
import sys
import threading
import time
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

HERE = Path(__file__).resolve().parent
VERSION = (HERE / "VERSION").read_text().strip()
CONFIG = json.loads((HERE / "config.json").read_text())

MODES = ("normal", "broken-delete", "broken-users", "slow-health")
ROLES = ("admin", "editor", "viewer")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MAX_BODY = 64 * 1024


class ApiError(Exception):
    """An error the client caused or should see: becomes a JSON response."""

    def __init__(self, status: int, message: str, *, headers: dict | None = None, **extra):
        super().__init__(message)
        self.status = status
        self.body = {"error": message, **extra}
        self.headers = headers or {}


def now() -> datetime:
    return datetime.now(timezone.utc)


def stamp(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def created_at() -> str:
    """Timestamps for new rows: HU_FIXED_TIME when it is set, so examples repeat exactly."""
    fixed = os.environ.get("HU_FIXED_TIME", "").strip()
    return fixed if fixed else stamp(now())


# --- Logs -------------------------------------------------------------------


class Logs:
    """The access log and the app log. reopen() is what SIGHUP calls after rotation."""

    def __init__(self, folder: Path):
        self.folder = folder
        self.lock = threading.Lock()
        self.access = self.app = None
        self.reopen()

    def reopen(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        with self.lock:
            for handle in (self.access, self.app):
                if handle:
                    handle.close()
            self.access = open(self.folder / "api-access.log", "a", buffering=1, encoding="utf-8")
            self.app = open(self.folder / "app.log", "a", buffering=1, encoding="utf-8")

    def close(self) -> None:
        with self.lock:
            for handle in (self.access, self.app):
                if handle:
                    handle.close()
            self.access = self.app = None

    def event(self, level: str, msg: str, **fields) -> None:
        moment = now()
        line = {"ts": moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z", "level": level}
        for key in ("method", "route", "status", "ms"):
            if key in fields:
                line[key] = fields.pop(key)
        line["msg"] = msg
        line.update(fields)
        with self.lock:
            if self.app:
                self.app.write(json.dumps(line, separators=(",", ":")) + "\n")

    def request(self, line: str) -> None:
        with self.lock:
            if self.access:
                self.access.write(line + "\n")


# --- Rate limiting and the flaky endpoint -------------------------------------


class RateLimiter:
    """At most `limit` requests in any one second, for the whole server."""

    def __init__(self, limit: int):
        self.limit = limit
        self.hits: deque[float] = deque()
        self.lock = threading.Lock()

    def allow(self) -> bool:
        moment = time.monotonic()
        with self.lock:
            while self.hits and moment - self.hits[0] >= 1.0:
                self.hits.popleft()
            if len(self.hits) >= self.limit:
                return False
            self.hits.append(moment)
            return True


class FlakyCounter:
    """GET /flaky fails the first N times for each X-Request-Id."""

    def __init__(self, failures: int):
        self.failures = failures
        self.seen: dict[str, int] = {}
        self.lock = threading.Lock()

    def attempt(self, key: str) -> int:
        with self.lock:
            self.seen[key] = self.seen.get(key, 0) + 1
            return self.seen[key]


# --- Database -------------------------------------------------------------------


class Database:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connect(self):
        """One connection per use, in autocommit mode: each statement commits unless a BEGIN is open."""
        conn = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            yield conn
        finally:
            conn.close()


def user_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "created_at": row["created_at"],
    }


def order_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "customer": row["customer"],
        "email": row["email"],
        "items": row["items"],
        "total": row["total_cents"] / 100,
        "status": row["status"],
        "created_at": row["created_at"],
    }


def task_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "owner": row["owner"],
        "done": bool(row["done"]),
        "created_at": row["created_at"],
    }


def check_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    algorithm, rounds, salt, digest = stored.split("$")
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
    return hmac.compare_digest(candidate, digest)


# --- Requests -----------------------------------------------------------------


class Request:
    """What a route handler needs to know about one request."""

    def __init__(self, handler: "Handler", method: str, raw: bytes):
        self.handler = handler
        self.method = method
        self.params: dict = {}
        url = urlsplit(handler.path)
        self.path = url.path
        self.query = {key: values[-1] for key, values in parse_qs(url.query, keep_blank_values=True).items()}
        self.user: sqlite3.Row | None = None
        self.auth: str | None = None
        self.raw = raw
        self._body = None

    def header(self, name: str) -> str:
        return self.handler.headers.get(name, "") or ""

    def json(self) -> dict:
        if self._body is None:
            if not self.header("Content-Type").lower().startswith("application/json"):
                raise ApiError(415, "Content-Type must be application/json")
            try:
                body = json.loads(self.raw or b"null")
            except ValueError:
                raise ApiError(400, "invalid JSON body") from None
            if not isinstance(body, dict):
                raise ApiError(400, "JSON body must be an object")
            self._body = body
        return self._body

    def id_param(self) -> int:
        raw = self.params["id"]
        return int(raw) if len(raw) <= 15 else 0

    def int_param(self, name: str, default: int, *, low: int = 1) -> int:
        raw = self.query.get(name, "")
        if raw == "":
            return default
        if not re.fullmatch(r"-?\d+", raw) or int(raw) < low:
            raise ApiError(400, f"{name} must be an integer of at least {low}")
        return int(raw)


class App:
    def __init__(self, db: Database, logs: Logs, mode: str, rate_limit: int | None):
        self.db = db
        self.logs = logs
        self.mode = mode
        self.limiter = RateLimiter(rate_limit) if rate_limit else None
        self.flaky_counter = FlakyCounter(CONFIG["flaky_failures"])
        self.started = time.monotonic()
        self.requests = 0
        self.in_flight = 0
        self.idle = threading.Condition()

    # Authentication ---------------------------------------------------------------

    def authenticate(self, req: Request) -> None:
        token = ""
        header = req.header("Authorization")
        if header.lower().startswith("bearer "):
            token, req.auth = header[7:].strip(), "header"
        elif "token" in req.query:
            token, req.auth = req.query["token"], "query"
        if token:
            with self.db.connect() as conn:
                req.user = conn.execute(
                    "SELECT users.* FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?", (token,)
                ).fetchone()
            if req.user is None:
                req.auth = None
            return
        self.session_user(req)

    def session_user(self, req: Request) -> None:
        cookies = SimpleCookie(req.header("Cookie"))
        morsel = cookies.get(CONFIG["session_cookie"])
        if morsel is None:
            return
        with self.db.connect() as conn:
            req.user = conn.execute(
                "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?", (morsel.value,)
            ).fetchone()
        req.auth = "cookie" if req.user else None

    def require(self, req: Request, *roles: str) -> sqlite3.Row:
        if req.user is None:
            raise ApiError(401, "missing or invalid token", headers={"WWW-Authenticate": 'Bearer realm="taskapi"'})
        if roles and req.user["role"] not in roles:
            raise ApiError(403, f"{' or '.join(roles)} role required")
        return req.user

    # Routes ------------------------------------------------------------------------

    def health(self, req: Request):
        if self.mode == "slow-health":
            time.sleep(1.4)
        with self.db.connect() as conn:
            schema = conn.execute("PRAGMA user_version").fetchone()[0]
        if schema != CONFIG["required_schema"]:
            return 500, {
                "status": "error",
                "version": VERSION,
                "error": f"database schema is {schema}, this release needs {CONFIG['required_schema']}",
            }
        return 200, {"status": "ok", "version": VERSION}

    def page_of(self, req: Request, table: str, where: list[str], args: list, to_json, extra: dict) -> dict:
        page = req.int_param("page", 1)
        per_page = min(req.int_param("per_page", CONFIG["per_page_default"]), CONFIG["per_page_max"])
        clause = f" WHERE {' AND '.join(where)}" if where else ""
        with self.db.connect() as conn:
            total = conn.execute(f"SELECT count(*) FROM {table}{clause}", args).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM {table}{clause} ORDER BY id LIMIT ? OFFSET ?", [*args, per_page, (page - 1) * per_page]
            ).fetchall()
        following = None
        if page * per_page < total:
            query = {key: value for key, value in extra.items() if value}
            query.update(page=page + 1, per_page=per_page)
            following = f"{req.path}?{urlencode(query)}"
        return {"data": [to_json(row) for row in rows], "page": page, "per_page": per_page, "total": total, "next": following}

    def users_guard(self) -> None:
        if self.mode == "broken-users":
            raise RuntimeError("users store unavailable (mode broken-users)")

    def list_users(self, req: Request):
        self.users_guard()
        where, args = [], []
        q = req.query.get("q", "").strip()
        if q:
            where.append("(lower(name) LIKE ? OR lower(email) LIKE ? OR lower(username) LIKE ?)")
            args += [f"%{q.lower()}%"] * 3
        role = req.query.get("role", "")
        if role:
            if role not in ROLES:
                raise ApiError(400, f"role must be one of {', '.join(ROLES)}")
            where.append("role = ?")
            args.append(role)
        return 200, self.page_of(req, "users", where, args, user_json, {"q": q, "role": role})

    def get_user(self, req: Request):
        self.users_guard()
        user_id = req.id_param()
        if user_id == CONFIG["slow_user_id"]:
            time.sleep(CONFIG["slow_user_delay_ms"] / 1000)
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise ApiError(404, "user not found")
        return 200, user_json(row)

    def create_user(self, req: Request):
        self.users_guard()
        self.require(req, "admin")
        body = req.json()
        name = body.get("name")
        email = body.get("email")
        role = body.get("role", "viewer")
        fields = {}
        if not isinstance(name, str) or not name.strip():
            fields["name"] = "is required"
        elif len(name.strip()) > 100:
            fields["name"] = "must be at most 100 characters"
        if not isinstance(email, str) or not email.strip():
            fields["email"] = "is required"
        elif not EMAIL.match(email.strip()):
            fields["email"] = "must be a valid email address"
        if role not in ROLES:
            fields["role"] = f"must be one of {', '.join(ROLES)}"
        if fields:
            raise ApiError(422, "validation failed", fields=fields)
        name, email = name.strip(), email.strip()
        with self.db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM users WHERE lower(email) = lower(?)", (email,)).fetchone():
                conn.execute("ROLLBACK")
                raise ApiError(409, "email already exists")
            base = re.sub(r"[^a-z0-9]+", "-", email.split("@")[0].lower()).strip("-") or "user"
            username, n = base, 1
            while conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                n += 1
                username = f"{base}-{n}"
            cursor = conn.execute(
                "INSERT INTO users (username, name, email, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (username, name, email, role, created_at()),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
            conn.execute("COMMIT")
        return 201, user_json(row), {"Location": f"/users/{row['id']}"}

    def list_orders(self, req: Request):
        where, args = [], []
        status = req.query.get("status", "")
        if status:
            where.append("status = ?")
            args.append(status)
        return 200, self.page_of(req, "orders", where, args, order_json, {"status": status})

    def get_order(self, req: Request):
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM orders WHERE id = ?", (req.id_param(),)).fetchone()
        if row is None:
            raise ApiError(404, "order not found")
        return 200, order_json(row)

    def list_tasks(self, req: Request):
        where, args = [], []
        owner = req.query.get("owner", "")
        if owner:
            where.append("owner = ?")
            args.append(owner)
        done = req.query.get("done", "")
        if done:
            if done not in ("true", "false"):
                raise ApiError(400, "done must be true or false")
            where.append("done = ?")
            args.append(1 if done == "true" else 0)
        clause = f" WHERE {' AND '.join(where)}" if where else ""
        with self.db.connect() as conn:
            rows = conn.execute(f"SELECT * FROM tasks{clause} ORDER BY id", args).fetchall()
        return 200, {"data": [task_json(row) for row in rows], "total": len(rows)}

    def find_task(self, conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise ApiError(404, "task not found")
        return row

    def get_task(self, req: Request):
        with self.db.connect() as conn:
            return 200, task_json(self.find_task(conn, req.id_param()))

    def task_fields(self, conn: sqlite3.Connection, body: dict, *, creating: bool) -> dict:
        allowed = {"title", "owner", "done"}
        unknown = sorted(set(body) - allowed)
        fields, values = {}, {}
        for name in unknown:
            fields[name] = "is not a task field"
        if "title" in body or creating:
            title = body.get("title")
            if not isinstance(title, str) or not title.strip():
                fields["title"] = "is required"
            elif len(title.strip()) > 200:
                fields["title"] = "must be at most 200 characters"
            else:
                values["title"] = title.strip()
        if "owner" in body:
            owner = body["owner"]
            if not isinstance(owner, str) or not conn.execute("SELECT 1 FROM users WHERE username = ?", (owner,)).fetchone():
                fields["owner"] = "must be the username of an existing user"
            else:
                values["owner"] = owner
        if "done" in body:
            if not isinstance(body["done"], bool):
                fields["done"] = "must be true or false"
            else:
                values["done"] = 1 if body["done"] else 0
        if not creating and not fields and not values:
            fields["body"] = "has nothing to change"
        if fields:
            raise ApiError(422, "validation failed", fields=fields)
        return values

    def create_task(self, req: Request):
        user = self.require(req, "admin", "editor")
        body = req.json()
        with self.db.connect() as conn:
            values = self.task_fields(conn, body, creating=True)
            cursor = conn.execute(
                "INSERT INTO tasks (title, owner, done, created_at) VALUES (?, ?, ?, ?)",
                (values["title"], values.get("owner", user["username"]), values.get("done", 0), created_at()),
            )
            row = self.find_task(conn, cursor.lastrowid)
        self.logs.event("info", f"created task {row['id']}", user=user["username"], trace_id=req.handler.trace_id)
        return 201, task_json(row), {"Location": f"/tasks/{row['id']}"}

    def update_task(self, req: Request):
        user = self.require(req, "admin", "editor")
        body = req.json()
        task_id = req.id_param()
        with self.db.connect() as conn:
            self.find_task(conn, task_id)
            values = self.task_fields(conn, body, creating=False)
            assignments = ", ".join(f"{name} = ?" for name in values)
            conn.execute(f"UPDATE tasks SET {assignments} WHERE id = ?", [*values.values(), task_id])
            row = self.find_task(conn, task_id)
        self.logs.event("info", f"updated task {task_id}", user=user["username"], trace_id=req.handler.trace_id)
        return 200, task_json(row)

    def delete_task(self, req: Request):
        user = self.require(req, "admin", "editor")
        task_id = req.id_param()
        if self.mode == "broken-delete":
            raise RuntimeError(f"could not delete task {task_id}: the tasks table is locked (mode broken-delete)")
        with self.db.connect() as conn:
            self.find_task(conn, task_id)
            conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.logs.event("info", f"deleted task {task_id}", user=user["username"], trace_id=req.handler.trace_id)
        return 204, None

    def login(self, req: Request):
        body = req.json()
        username, password = body.get("user"), body.get("password")
        if not isinstance(username, str) or not isinstance(password, str):
            raise ApiError(422, "validation failed", fields={"user": "is required", "password": "is required"})
        with self.db.connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if user is None or not check_password(password, user["password_hash"]):
                raise ApiError(401, "invalid username or password")
            count = conn.execute("SELECT count(*) FROM sessions").fetchone()[0]
            session = hashlib.sha256(f"{CONFIG['session_secret']}:{username}:{count + 1}".encode()).hexdigest()[:32]
            conn.execute("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)", (session, user["id"], created_at()))
        cookie = f"{CONFIG['session_cookie']}={session}; Path=/; HttpOnly; SameSite=Lax"
        return 200, {"user": user["username"], "name": user["name"]}, {"Set-Cookie": cookie}

    def me(self, req: Request):
        if req.user is None:
            raise ApiError(401, "not logged in")
        return 200, user_json(req.user)

    def logout(self, req: Request):
        cookies = SimpleCookie(req.header("Cookie"))
        morsel = cookies.get(CONFIG["session_cookie"])
        if morsel is not None:
            with self.db.connect() as conn:
                conn.execute("DELETE FROM sessions WHERE id = ?", (morsel.value,))
        expired = f"{CONFIG['session_cookie']}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        return 204, None, {"Set-Cookie": expired}

    def admin_stats(self, req: Request):
        self.require(req, "admin")
        with self.db.connect() as conn:
            count = {table: conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("users", "orders", "tasks")}
            open_tasks = conn.execute("SELECT count(*) FROM tasks WHERE done = 0").fetchone()[0]
            revenue = conn.execute(
                "SELECT coalesce(sum(total_cents), 0) FROM orders WHERE status IN ('paid', 'shipped', 'delivered')"
            ).fetchone()[0]
        return 200, {
            **count,
            "open_tasks": open_tasks,
            "revenue": revenue / 100,
            "requests": self.requests,
            "uptime_s": int(time.monotonic() - self.started),
            "version": VERSION,
            "mode": self.mode,
        }

    def slow(self, req: Request):
        ms = req.int_param("ms", 1000, low=-(10**9))
        if ms > 30000:
            raise ApiError(400, "ms must be at most 30000")
        time.sleep(ms / 1000)
        return 200, {"slept_ms": ms}

    def flaky(self, req: Request):
        attempt = self.flaky_counter.attempt(req.header("X-Request-Id") or "-")
        if attempt <= self.flaky_counter.failures:
            raise ApiError(503, "temporarily unavailable, try again", headers={"Retry-After": "1"}, attempt=attempt)
        return 200, {"status": "ok", "attempt": attempt}

    def boom(self, req: Request):
        raise RuntimeError("boom: this route always fails, on purpose")


ROUTES = [
    ("GET", r"/health", "health"),
    ("GET", r"/users", "list_users"),
    ("POST", r"/users", "create_user"),
    ("GET", r"/users/(?P<id>\d+)", "get_user"),
    ("GET", r"/orders", "list_orders"),
    ("GET", r"/orders/(?P<id>\d+)", "get_order"),
    ("GET", r"/tasks", "list_tasks"),
    ("POST", r"/tasks", "create_task"),
    ("GET", r"/tasks/(?P<id>\d+)", "get_task"),
    ("PATCH", r"/tasks/(?P<id>\d+)", "update_task"),
    ("DELETE", r"/tasks/(?P<id>\d+)", "delete_task"),
    ("POST", r"/login", "login"),
    ("GET", r"/me", "me"),
    ("POST", r"/logout", "logout"),
    ("GET", r"/admin/stats", "admin_stats"),
    ("GET", r"/slow", "slow"),
    ("GET", r"/flaky", "flaky"),
    ("GET", r"/boom", "boom"),
]
COMPILED = [(method, re.compile(pattern + r"/?"), name, re.sub(r"\(\?P<(\w+)>[^)]*\)", r"{\1}", pattern)) for method, pattern, name in ROUTES]


def route_for(method: str, path: str):
    allowed = []
    for route_method, pattern, name, label in COMPILED:
        found = pattern.fullmatch(path)
        if found:
            if route_method == method:
                return name, found.groupdict(), label, []
            allowed.append(route_method)
    return None, {}, None, allowed


# --- HTTP ----------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = f"taskapi/{VERSION}"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = 10
    app: App

    def do_GET(self):
        self.dispatch("GET")

    def do_HEAD(self):
        self.dispatch("HEAD")

    def do_POST(self):
        self.dispatch("POST")

    def do_PATCH(self):
        self.dispatch("PATCH")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def do_PUT(self):
        self.dispatch("PUT")

    def log_message(self, format, *args):
        """Request lines go to logs/api-access.log instead of stderr."""

    def dispatch(self, method: str) -> None:
        """Counts the request as in flight until its response and log lines are written."""
        app = self.app
        with app.idle:
            app.in_flight += 1
            app.requests += 1
        try:
            self.serve(method)
        finally:
            with app.idle:
                app.in_flight -= 1
                app.idle.notify_all()

    def serve(self, method: str) -> None:
        app = self.app
        started = time.monotonic()
        self.trace_id = re.sub(r"[^\w.:-]", "", self.headers.get("X-Request-Id", ""))[:64] or secrets.token_hex(8)
        lookup = "GET" if method == "HEAD" else method
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            self.close_connection = True
            self.respond(method, 413 if length > MAX_BODY else 400, {"error": "bad or too large request body (64 KB at most)"}, {})
            return
        req = Request(self, lookup, self.rfile.read(length) if length else b"")
        name, req.params, label, allowed = route_for(lookup, req.path)
        status, body, headers = 500, None, {}
        try:
            if app.limiter and not app.limiter.allow():
                raise ApiError(429, "rate limit exceeded", headers={"Retry-After": "1"}, retry_after=1)
            if name is None:
                if allowed:
                    raise ApiError(405, "method not allowed", headers={"Allow": ", ".join(sorted(set(allowed)))})
                raise ApiError(404, "not found")
            app.authenticate(req)
            result = getattr(app, name)(req)
            status, body = result[0], result[1]
            headers = result[2] if len(result) > 2 else {}
        except ApiError as error:
            status, body, headers = error.status, error.body, error.headers
        except Exception as error:  # noqa: BLE001 - every other failure is a 500 with a log line
            status, body, headers = 500, {"error": "internal server error"}, {}
            app.logs.event(
                "error",
                f"unhandled error: {type(error).__name__}: {error}",
                method=lookup,
                route=label or req.path,
                trace_id=self.trace_id,
            )
        self.respond(method, status, body, headers)
        elapsed = time.monotonic() - started
        self.log_request_line(status, elapsed, req)
        level = "error" if status >= 500 else "warn" if status >= 400 or elapsed > 1 else "info"
        fields = {"method": lookup, "route": label or req.path, "status": status, "ms": round(elapsed * 1000)}
        if req.user is not None:
            fields.update(user=req.user["username"], auth=req.auth)
        if req.auth == "query":
            app.logs.event("warn", "token sent in the query string, use the Authorization header", trace_id=self.trace_id, **fields)
        app.logs.event(level, "slow request" if elapsed > 1 else "request", trace_id=self.trace_id, **fields)

    def respond(self, method: str, status: int, body, headers: dict) -> None:
        payload = b"" if body is None else (json.dumps(body, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
        self.sent_bytes = 0
        self.send_response(status)
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Request-Id", self.trace_id)
        for key, value in headers.items():
            self.send_header(key, value)
        try:
            self.end_headers()
            if method != "HEAD":
                self.wfile.write(payload)
                self.sent_bytes = len(payload)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def log_request_line(self, status: int, elapsed: float, req: Request) -> None:
        moment = now()
        when = f"{moment.day:02d}/{MONTHS[moment.month - 1]}/{moment.year}:{moment.strftime('%H:%M:%S')} +0000"
        user = req.user["username"] if req.user is not None else "-"
        referer = self.headers.get("Referer", "-").replace('"', "%22")
        agent = self.headers.get("User-Agent", "-").replace('"', "%22")
        request_line = self.requestline.replace('"', "%22")
        self.app.logs.request(
            f'{self.client_address[0]} - {user} [{when}] "{request_line}" {status} {self.sent_bytes} "{referer}" "{agent}" {elapsed:.3f}'
        )


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


# --- Startup ----------------------------------------------------------------------


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="taskapi", description="The shop team's JSON API.")
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=CONFIG["port"], help=f"port to listen on (default {CONFIG['port']})")
    parser.add_argument("--db", default="data/shop.db", help="SQLite database (default data/shop.db)")
    parser.add_argument("--log-dir", default="logs", help="folder for api-access.log and app.log (default logs)")
    parser.add_argument("--mode", choices=MODES, default="normal", help="break something on purpose, for practice")
    parser.add_argument("--rate-limit", metavar="N/s", help="answer 429 above N requests a second, for example 5/s")
    args = parser.parse_args(argv)
    if args.rate_limit is not None:
        match = re.fullmatch(r"(\d+)/s", args.rate_limit)
        if not match or int(match.group(1)) < 1:
            parser.error("--rate-limit must look like 5/s")
        args.rate_limit = int(match.group(1))
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"taskapi: database not found: {db_path} (bin/taskapictl reset builds it)", file=sys.stderr)
        return 1
    logs = Logs(Path(args.log_dir))
    app = App(Database(db_path), logs, args.mode, args.rate_limit)
    Handler.app = app
    try:
        server = Server((args.host, args.port), Handler)
    except OSError as error:
        print(f"taskapi: cannot listen on {args.host}:{args.port}: OSError: {error}", file=sys.stderr)
        logs.event("error", f"cannot listen on {args.host}:{args.port}: {error}")
        logs.close()
        return 1

    def stop(signum, _frame):
        logs.event("info", f"received {signal.Signals(signum).name}, finishing {app.in_flight} request(s)")
        threading.Thread(target=server.shutdown, daemon=True).start()

    def reopen(_signum, _frame):
        def work():
            logs.reopen()
            logs.event("info", "reopened log files")

        threading.Thread(target=work, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGHUP, reopen)

    rate = f", rate limit {args.rate_limit}/s" if args.rate_limit else ""
    banner = f"taskapi {VERSION} listening on {args.host}:{args.port} (mode {args.mode}{rate})"
    logs.event("info", banner, pid=os.getpid())
    print(banner, flush=True)
    server.serve_forever(poll_interval=0.2)
    server.server_close()
    deadline = time.monotonic() + 5
    with app.idle:
        while app.in_flight and time.monotonic() < deadline:
            app.idle.wait(0.1)
    logs.event("info", "shutdown complete")
    logs.close()
    print("taskapi stopped", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
