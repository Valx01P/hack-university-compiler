#!/usr/bin/env python3
"""Writes shopfront-ops's generated files. Authoring time only, never in a workspace.

    python3 generate.py

What it writes, all from fixed data (a second run changes nothing):

- seed/shopfront-app/<tag>/: the four releases of taskapi in the bare repo the seed builds.
  v2.14.0/server.py, config.json and VERSION are hand-written. This script writes v2.14.0's
  seed.sql and derives v2.13.0, v2.14.1 and v2.15.0-rc1 from v2.14.0 with checked edits.
- base/shopfront-ops/releases/: v2.13.0 and v2.14.0 as deployed, with REVISION, the short
  hash of the tag in the history seed.sh builds (computed here with the same git commands).
- base/shopfront-ops/data/: orders.csv (600), customers.csv (120), products.json (30),
  new-users.csv (25).
- base/shopfront-ops/logs/: api-access.log, api-access.log.1, api-access.log.2.gz, app.log.

Needs Python 3.10+ and git.
"""

from __future__ import annotations

import gzip
import io
import json
import os
import random
import re
import shutil
import subprocess
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE / "seed" / "shopfront-app"
OPS = HERE / "base" / "shopfront-ops"
TAGS = ["v2.13.0", "v2.14.0", "v2.14.1", "v2.15.0-rc1"]

# The bare repo's history: one commit per release, fixed authors and dates, so every
# workspace gets the same hashes. seed.sh reads the same table from seed/app-history.tsv.
APP_HISTORY_FILE = HERE / "seed" / "app-history.tsv"

PASSWORDS = {
    "ada": "pbkdf2_sha256$60000$f86af087a41ab001$d886a7b55f4cf5f4fac2e998e419d489eabcc799397bdd40f1ee9f91c0404b3d",
    "grace": "pbkdf2_sha256$60000$8bed5eca07dd43c5$9f6b7dd8210562ce07b54f833930285c27ebd97ad24e539b08efdd460a81cdbb",
}

USERS = [
    (1, "ada", "Ada Lovelace", "admin", "2026-01-12T09:00:00Z"),
    (2, "grace", "Grace Hopper", "admin", "2026-01-12T09:05:00Z"),
    (3, "alan", "Alan Turing", "editor", "2026-02-03T10:20:00Z"),
    (4, "katherine", "Katherine Johnson", "editor", "2026-02-17T14:45:00Z"),
    (5, "daan", "Daan van der Berg", "viewer", "2026-03-02T08:30:00Z"),
    (6, "mila", "Mila van der Meer", "editor", "2026-03-19T11:10:00Z"),
    (7, "linus", "Linus Torvalds", "viewer", "2026-04-07T16:00:00Z"),
    (8, "margaret", "Margaret Hamilton", "editor", "2026-05-11T09:40:00Z"),
    (9, "edsger", "Edsger Dijkstra", "viewer", "2026-06-01T13:15:00Z"),
    (10, "barbara", "Barbara Liskov", "editor", "2026-06-22T10:05:00Z"),
    (11, "sophie", "Sophie van der Linden", "viewer", "2026-08-04T15:30:00Z"),
    (12, "ken", "Ken Thompson", "viewer", "2026-09-09T09:00:00Z"),
    (13, "sloane", "Sloane Waite", "viewer", "2026-09-30T12:00:00Z"),
]

TASKS = [
    ("Rotate the API logs every night", "ada", True),
    ("Write the on-call runbook", "grace", True),
    ("Add a health check to cron", "alan", True),
    ("Move backups to the new disk", "katherine", False),
    ("Check backups restore cleanly", "ada", False),
    ("Make report-sales.sh take a date range", "grace", False),
    ("Stop putting tokens in URLs", "alan", False),
    ("Alert only when a check changes", "katherine", False),
    ("Import the new users from HR", "ada", False),
    ("Speed up the customer stats report", "grace", False),
    ("Compress old logs in parallel", "alan", True),
    ("Add pre-deploy hooks", "katherine", False),
    ("Snapshot the database before backups", "ada", False),
    ("Write tests for the HTTP helpers", "grace", False),
    ("Restart the worker when it crashes", "alan", False),
    ("Document the deploy steps", "katherine", True),
    ("Clean up old releases", "ada", True),
    ("Shellcheck every script in CI", "grace", True),
    ("Replace the 2016 backup script", "alan", True),
    ("Give Dana access to the shared folder", "ada", True),
    ("Rate limit the import script", "grace", False),
    ("Add the products report to make report", "alan", False),
    ("Check disk usage every 5 minutes", "katherine", True),
    ("Archive September's exports", "ada", False),
    ("Update the crontab after the move", "grace", True),
]

PRODUCTS = [
    ("MUG-350", "Mug, stoneware, 350 ml", "kitchen", 14.00, 85),
    ("CUP-ESP", "Espresso cups, set of 2", "kitchen", 18.50, 40),
    ("TWL-LIN", "Tea towel, linen", "kitchen", 9.90, 120),
    ("BWL-OAK", "Serving bowl, oak", "kitchen", 34.00, 25),
    ("JAR-HNY", "Honey jar with dipper", "kitchen", 12.00, 60),
    ("NB-A5-DOT", "Notebook, A5, dotted", "stationery", 6.50, 300),
    ("NB-A5-LIN", "Notebook, A5, lined", "stationery", 6.50, 250),
    ("SKB-A4", "Sketchbook, A4, blank", "stationery", 11.00, 90),
    ("PEN-GEL", "Gel pen, black, 0.5 mm", "stationery", 2.40, 500),
    ("PEN-FTN", "Fountain pen, steel nib", "stationery", 28.00, 35),
    ("CAL-2027", "Wall calendar 2027", "stationery", 16.00, 150),
    ("PST-SUN", 'Poster "Sunrise", A3', "prints", 22.00, 70),
    ("PST-HBR", "Poster, harbor at night, A2", "prints", 29.00, 45),
    ("CRD-THX", "Thank-you cards, pack of 10", "prints", 8.00, 200),
    ("CRD-BDY", "Birthday card", "prints", 3.50, 400),
    ("BAG-TOT", "Tote bag, canvas", "bags", 15.00, 110),
    ("BAG-MKT", "Market bag, organic cotton", "bags", 19.00, 80),
    ("BAG-RLL", "Roll-top backpack", "bags", 79.00, 20),
    ("BAG-PCH", "Zip pouch, small", "bags", 12.50, 95),
    ("CND-FIG", "Candle, fig and cedar", "home", 24.00, 65),
    ("CND-SEA", "Candle, sea salt", "home", 24.00, 60),
    ("POT-12", "Plant pot, terracotta, 12 cm", "home", 9.00, 140),
    ("BLK-WOL", "Wool blanket", "home", 89.00, 15),
    ("CSH-LIN", "Cushion cover, linen", "home", 21.00, 75),
    ("SOP-OAT", "Soap bar, oat", "care", 5.50, 220),
    ("SOP-LAV", "Soap bar, lavender", "care", 5.50, 210),
    ("BLM-LIP", "Lip balm", "care", 4.00, 300),
    ("CRM-HND", "Hand cream, 75 ml", "care", 13.00, 90),
    ("GFT-25", "Gift card, 25 EUR", "gifts", 25.00, 999),
    ("GFT-50", "Gift card, 50 EUR", "gifts", 50.00, 999),
]

FIRST = [
    "Maya", "Liam", "Sofia", "Noah", "Ines", "Lucas", "Emma", "Mateo", "Chloe", "Yusuf", "Hannah", "Tomas",
    "Aisha", "Jonas", "Lea", "Omar", "Julia", "Felix", "Zara", "Diego", "Nora", "Ivan", "Elena", "Kofi",
    "Mei", "Arjun", "Freya", "Pablo", "Amira", "Leon",
]
LAST = [
    "Patel", "Silva", "Novak", "Moreau", "Rossi", "Jensen", "Kowalski", "Haddad", "Fischer", "Okafor", "Costa",
    "Nguyen", "Larsen", "Garcia", "Byrne", "Schmidt", "Ferreira", "Dubois", "Yilmaz", "Andersson", "Mensah",
    "Kaur", "Romano", "Weber",
]
CITIES = ["Lisbon", "Porto", "Madrid", "Berlin", "Krakow", "Dublin", "Lyon", "Milan", "Rotterdam", "Ghent", "Vienna", "Oslo"]
QUOTED_NAMES = {7: "Robert Hughes, Jr.", 23: "Anne Dubois, PhD", 41: "Kim, Min-jun", 77: "Garcia, Lucia", 102: "Sean O'Brien, Sr."}


def write(path: Path, text: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(text, str):
        text = text.encode()
    path.write_bytes(text)


def csv_field(value) -> str:
    text = str(value)
    if any(ch in text for ch in ',"\n'):
        return '"' + text.replace('"', '""') + '"'
    return text


def csv_line(values) -> str:
    return ",".join(csv_field(v) for v in values)


# --- data/ ------------------------------------------------------------------------


def customers() -> list[tuple]:
    rng = random.Random(120)
    rows, used = [], set()
    for cid in range(1, 121):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        name = QUOTED_NAMES.get(cid, f"{first} {last}")
        base = re.sub(r"[^a-z]+", ".", f"{first} {last}".lower()).strip(".")
        email, n = f"{base}@example.com", 1
        while email in used:
            n += 1
            email = f"{base}{n}@example.com"
        used.add(email)
        signup = date(2024, 1, 15) + timedelta(days=rng.randint(0, 990))
        rows.append((cid, name, email, rng.choice(CITIES), signup.isoformat()))
    return rows


def orders(customer_rows) -> list[tuple]:
    rng = random.Random(600)
    weights = [9, 3, 6, 2, 4, 10, 8, 4, 12, 2, 5, 4, 2, 6, 9, 7, 4, 1, 4, 5, 5, 6, 1, 3, 7, 7, 9, 4, 3, 2]
    rows = []
    first_day, last_day = date(2026, 9, 1), date(2026, 10, 18)
    days = (last_day - first_day).days + 1
    per_day = [9 + (3 if (first_day + timedelta(d)).weekday() >= 5 else 0) for d in range(days)]
    extra = 600 - sum(per_day)
    for i in range(extra):
        per_day[rng.randrange(days)] += 1
    oid = 10001
    regulars = [c[0] for c in customer_rows[:30]]
    for d, count in enumerate(per_day):
        day = first_day + timedelta(days=d)
        age = (date(2026, 10, 19) - day).days
        for _ in range(count):
            sku, name, category, price, _stock = rng.choices(PRODUCTS, weights=weights)[0]
            qty = 1 if category == "gifts" else rng.choices([1, 2, 3, 4], weights=[60, 25, 10, 5])[0]
            unit = price
            if category == "home" and date(2026, 10, 5) <= day <= date(2026, 10, 11):
                unit = round(price * 0.8, 2)
            roll = rng.random()
            if roll < 0.05:
                status = "cancelled"
            elif roll < 0.08 and age > 3:
                status = "refunded"
            elif age <= 1:
                status = "pending" if roll < 0.35 else "paid"
            elif age <= 6:
                status = "shipped"
            else:
                status = "delivered"
            customer = rng.choice(regulars) if rng.random() < 0.4 else rng.randint(1, 120)
            rows.append((oid, day.isoformat(), customer, name, qty, f"{unit:.2f}", status))
            oid += 1
    assert len(rows) == 600, len(rows)
    return rows


def new_users() -> list[tuple]:
    rows = [
        ("Priya Shah", "priya.shah@shopfront.example", "editor"),
        ("Tom Becker", "tom.becker@shopfront.example", "viewer"),
        ("Alan Turing", "alan@shopfront.example", "editor"),
        ("Lucia Romano", "lucia.romano@shopfront.example", "viewer"),
        ("Nakamura, Yui", "yui.nakamura@shopfront.example", "editor"),
        ("Felix Wagner", "felix.wagner@shopfront.example", "viewer"),
        ("Amara Okeke", "amara.okeke@shopfront.example", "viewer"),
        ("Barbara Liskov", "barbara@shopfront.example", "editor"),
        ("Jonas Berg", "jonas.berg@shopfront.example", "viewer"),
        ("Chloe Martin", "chloe.martin@shopfront.example", "editor"),
        ("Luis Ortega", "luis.ortega.shopfront.example", "viewer"),
        ("Hana Novak", "hana.novak@shopfront.example", "viewer"),
        ("Omar Haddad", "omar.haddad@shopfront.example", "editor"),
        ("Ken Thompson", "ken@shopfront.example", "viewer"),
        ("Sara Lindqvist", "sara.lindqvist@shopfront.example", "viewer"),
        ("Diego Costa", "diego.costa@shopfront.example", "viewer"),
        ("Mei Chen", "mei.chen@shopfront.example", "editor"),
        ("Ivan Petrov", "ivan.petrov@shopfront.example", "viewer"),
        ("Zara Ahmed", "zara.ahmed@shopfront.example", "viewer"),
        ("Leon Fischer", "leon.fischer@shopfront.example", "editor"),
        ("Nora Byrne", "nora.byrne@shopfront.example", "viewer"),
        ("Kofi Mensah", "kofi.mensah@shopfront.example", "viewer"),
        ("Elena Silva", "elena.silva@shopfront.example", "viewer"),
        ("Arjun Kaur", "arjun.kaur@shopfront.example", "editor"),
        ("Freya Jensen", "freya.jensen@shopfront.example", "viewer"),
    ]
    assert len(rows) == 25
    return rows


def data_files() -> tuple[list[tuple], list[tuple]]:
    customer_rows = customers()
    order_rows = orders(customer_rows)
    write(OPS / "data/customers.csv", "\n".join([csv_line(["id", "name", "email", "city", "signup_date"])] + [csv_line(r) for r in customer_rows]) + "\n")
    write(
        OPS / "data/orders.csv",
        "\n".join([csv_line(["id", "date", "customer_id", "product", "qty", "unit_price", "status"])] + [csv_line(r) for r in order_rows]) + "\n",
    )
    products = [{"sku": s, "name": n, "category": c, "price": p, "stock": st} for s, n, c, p, st in PRODUCTS]
    write(OPS / "data/products.json", json.dumps(products, indent=2, ensure_ascii=False) + "\n")
    write(OPS / "data/new-users.csv", "\n".join([csv_line(["name", "email", "role"])] + [csv_line(r) for r in new_users()]) + "\n")
    return customer_rows, order_rows


# --- seed.sql ---------------------------------------------------------------------


def sql(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def db_orders(customer_rows) -> list[tuple]:
    rng = random.Random(40)
    rows = []
    start = datetime(2026, 10, 1, 8, 0, tzinfo=timezone.utc)
    for oid in range(1, 41):
        cid, name, email, *_ = customer_rows[(oid * 7) % 120]
        if oid == 9:
            name = "Rossi, Giulia"
            email = "giulia.rossi@example.com"
        items = rng.randint(1, 5)
        total_cents = sum(int(round(rng.choice(PRODUCTS)[3] * 100)) for _ in range(items))
        moment = start + timedelta(minutes=oid * 610 + rng.randint(0, 300))
        age = (datetime(2026, 10, 19, tzinfo=timezone.utc) - moment).days
        status = "delivered" if age > 6 else "shipped" if age > 1 else "paid"
        if oid in (5, 17, 31):
            status = "cancelled"
        if oid == 22:
            status = "refunded"
        if oid in (39, 40):
            status = "pending"
        rows.append((oid, name, email, items, total_cents, status, moment.strftime("%Y-%m-%dT%H:%M:%SZ")))
    return rows


def seed_sql(customer_rows, *, schema: int) -> str:
    rng = random.Random(25)
    out = [
        f"-- taskapi's database, schema version {schema}. bin/taskapictl reset rebuilds it:",
        "--   sqlite3 data/shop.db < releases/current/seed.sql",
        f"PRAGMA user_version = {schema};",
        "",
        "BEGIN;",
        "",
        "CREATE TABLE users (",
        "  id            INTEGER PRIMARY KEY,",
        "  username      TEXT NOT NULL UNIQUE,",
        "  name          TEXT NOT NULL,",
        "  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,",
        "  role          TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),",
        "  password_hash TEXT,",
        "  created_at    TEXT NOT NULL",
        ");",
        "",
        "CREATE TABLE tokens (",
        "  token   TEXT PRIMARY KEY,",
        "  user_id INTEGER NOT NULL REFERENCES users (id),",
        "  label   TEXT NOT NULL",
        ");",
        "",
        "CREATE TABLE sessions (",
        "  id         TEXT PRIMARY KEY,",
        "  user_id    INTEGER NOT NULL REFERENCES users (id),",
        "  created_at TEXT NOT NULL",
        ");",
        "",
        "CREATE TABLE orders (",
        "  id          INTEGER PRIMARY KEY,",
        "  customer    TEXT NOT NULL,",
        "  email       TEXT NOT NULL,",
        "  items       INTEGER NOT NULL CHECK (items > 0),",
        "  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),",
        "  status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),",
        "  created_at  TEXT NOT NULL",
        ");",
        "",
        "CREATE TABLE tasks (",
        "  id         INTEGER PRIMARY KEY,",
        "  title      TEXT NOT NULL,",
        "  owner      TEXT NOT NULL REFERENCES users (username),",
        "  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),",
    ]
    if schema >= 3:
        out.append("  priority   INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),")
    out += [
        "  created_at TEXT NOT NULL",
        ");",
        "",
        "CREATE INDEX orders_status ON orders (status);",
        "CREATE INDEX tasks_owner ON tasks (owner);",
        "",
    ]
    for uid, username, name, role, created in USERS:
        email = f"{username}@shopfront.example"
        out.append(
            "INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES "
            f"({uid}, {sql(username)}, {sql(name)}, {sql(email)}, {sql(role)}, {sql(PASSWORDS.get(username))}, {sql(created)});"
        )
    out += [
        "",
        "INSERT INTO tokens (token, user_id, label) VALUES ('dev-token-123', 1, 'local development, admin');",
        "INSERT INTO tokens (token, user_id, label) VALUES ('viewer-token-456', 12, 'read-only dashboard');",
        "",
    ]
    for row in db_orders(customer_rows):
        out.append(
            "INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES ("
            + ", ".join(sql(v) for v in row)
            + ");"
        )
    out.append("")
    start = datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc)
    for tid, (title, owner, done) in enumerate(TASKS, start=1):
        moment = start + timedelta(hours=tid * 19 + rng.randint(0, 6))
        columns = "id, title, owner, done, created_at"
        values = [tid, title, owner, done, moment.strftime("%Y-%m-%dT%H:%M:%SZ")]
        if schema >= 3:
            columns = "id, title, owner, done, priority, created_at"
            values.insert(4, 1 + (tid * 5) % 3)
        out.append(f"INSERT INTO tasks ({columns}) VALUES (" + ", ".join(sql(v) for v in values) + ");")
    out += ["", "COMMIT;", ""]
    return "\n".join(out)


# --- The other releases -----------------------------------------------------------


def edit(text: str, old: str, new: str) -> str:
    assert text.count(old) == 1, f"expected exactly one {old[:70]!r}"
    return text.replace(old, new)


def drop_method(text: str, name: str) -> str:
    pattern = re.compile(rf"\n    def {name}\(.*?(?=\n    def |\n    # |\n\n\nROUTES)", re.S)
    assert len(pattern.findall(text)) == 1, name
    return pattern.sub("", text)


def releases(customer_rows) -> None:
    v214 = APP / "v2.14.0"
    server = (v214 / "server.py").read_text()
    config = json.loads((v214 / "config.json").read_text())
    write(v214 / "seed.sql", seed_sql(customer_rows, schema=2))

    # 2.13.0: the release before session login, so no /login, /me, /logout and no cookies.
    old = server
    for name in ("session_user", "login", "me", "logout"):
        old = drop_method(old, name)
    old = edit(old, "            return\n        self.session_user(req)\n", "")
    old = edit(old, '    ("POST", r"/login", "login"),\n    ("GET", r"/me", "me"),\n    ("POST", r"/logout", "logout"),\n', "")
    old = edit(old, "from http.cookies import SimpleCookie\n", "")
    old = edit(old, "import hashlib\nimport hmac\n", "")
    old = re.sub(r"\n\ndef check_password\(.*?(?=\n\n\n)", "", old, count=1, flags=re.S)
    assert "check_password" not in old and "SimpleCookie" not in old and "session" not in old.lower().replace("sessions", "")
    old_config = {k: v for k, v in config.items() if not k.startswith("session_")}
    write(APP / "v2.13.0/server.py", old)
    write(APP / "v2.13.0/config.json", json.dumps(old_config, indent=2) + "\n")
    write(APP / "v2.13.0/VERSION", "2.13.0\n")
    write(APP / "v2.13.0/seed.sql", seed_sql(customer_rows, schema=2))

    # 2.14.1: /slow?ms=-5 crashed with a 500. Now it is a 400.
    fixed = edit(server, 'ms = req.int_param("ms", 1000, low=-(10**9))', 'ms = req.int_param("ms", 1000, low=0)')
    write(APP / "v2.14.1/server.py", fixed)
    write(APP / "v2.14.1/config.json", json.dumps(config, indent=2) + "\n")
    write(APP / "v2.14.1/VERSION", "2.14.1\n")
    write(APP / "v2.14.1/seed.sql", seed_sql(customer_rows, schema=2))

    # 2.15.0-rc1: task priorities, which need schema 3. Deployed onto a schema 2 database,
    # its /health answers 500, which is what the deploy lessons roll back from.
    rc = fixed
    rc = edit(rc, '        "done": bool(row["done"]),\n', '        "done": bool(row["done"]),\n        "priority": row["priority"],\n')
    rc = edit(rc, 'allowed = {"title", "owner", "done"}', 'allowed = {"title", "owner", "done", "priority"}')
    rc = edit(
        rc,
        "        if not creating and not fields and not values:",
        "        if \"priority\" in body:\n"
        "            priority = body[\"priority\"]\n"
        "            if not isinstance(priority, int) or isinstance(priority, bool) or not 1 <= priority <= 3:\n"
        "                fields[\"priority\"] = \"must be 1 (low), 2 (medium) or 3 (high)\"\n"
        "            else:\n"
        "                values[\"priority\"] = priority\n"
        "        if not creating and not fields and not values:",
    )
    rc = edit(
        rc,
        '"INSERT INTO tasks (title, owner, done, created_at) VALUES (?, ?, ?, ?)",\n'
        '                (values["title"], values.get("owner", user["username"]), values.get("done", 0), created_at()),',
        '"INSERT INTO tasks (title, owner, done, priority, created_at) VALUES (?, ?, ?, ?, ?)",\n'
        '                (values["title"], values.get("owner", user["username"]), values.get("done", 0), values.get("priority", 2), created_at()),',
    )
    write(APP / "v2.15.0-rc1/server.py", rc)
    write(APP / "v2.15.0-rc1/config.json", json.dumps({**config, "required_schema": 3}, indent=2) + "\n")
    write(APP / "v2.15.0-rc1/VERSION", "2.15.0-rc1\n")
    write(APP / "v2.15.0-rc1/seed.sql", seed_sql(customer_rows, schema=3))

    revisions = build_app_history()
    for folder, tag in (("2026-10-01T0900-v2.13.0", "v2.13.0"), ("2026-10-02T0900-v2.14.0", "v2.14.0")):
        dest = OPS / "releases" / folder
        dest.mkdir(parents=True, exist_ok=True)
        for name in ("server.py", "seed.sql", "config.json", "VERSION"):
            shutil.copyfile(APP / tag / name, dest / name)
        write(dest / "REVISION", revisions[tag] + "\n")
    current = OPS / "releases" / "current"
    if current.is_symlink() or current.exists():
        current.unlink()
    current.symlink_to("2026-10-02T0900-v2.14.0")


def build_app_history() -> dict[str, str]:
    """Builds the bare repo exactly as seed.sh does and returns each tag's short hash."""
    revisions = {}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "work"
        work.mkdir()
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        env.update(HOME=tmp, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL="/dev/null", TZ="UTC")

        def git(*args):
            return subprocess.run(["git", "-C", str(work), *args], env=env, check=True, capture_output=True, text=True).stdout

        git("init", "-q", "-b", "main")
        for line in APP_HISTORY_FILE.read_text().splitlines():
            if not line or line.startswith("#"):
                continue
            tag, when, author, email, subject = line.split("\t")
            for name in ("server.py", "seed.sql", "config.json", "VERSION"):
                shutil.copyfile(APP / tag / name, work / name)
                os.chmod(work / name, 0o644)
            git("add", "-A")
            env.update(
                GIT_AUTHOR_NAME=author, GIT_AUTHOR_EMAIL=email, GIT_AUTHOR_DATE=when,
                GIT_COMMITTER_NAME=author, GIT_COMMITTER_EMAIL=email, GIT_COMMITTER_DATE=when,
            )
            git("commit", "-q", "-m", subject)
            git("tag", tag)
            revisions[tag] = git("rev-parse", "--short", tag).strip()
    return revisions


# --- logs/ ---------------------------------------------------------------------------


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def clf(moment: datetime) -> str:
    return f"{moment.day:02d}/{MONTHS[moment.month - 1]}/{moment.year}:{moment.strftime('%H:%M:%S')} +0000"


def iso_ms(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def day_of_traffic(day: date, until: tuple[int, int], rng: random.Random):
    """One day's requests: (time, method, target, status, bytes, agent, user, auth, seconds, route)."""
    events = []
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    end = start + timedelta(hours=until[0], minutes=until[1])

    def add(moment, method, target, status, size, agent="curl/8.14.1", user="-", auth=None, secs=None, route=None):
        if moment < end:
            secs = secs if secs is not None else rng.uniform(0.001, 0.006)
            events.append((moment, method, target, status, size, agent, user, auth, secs, route or target.split("?")[0]))

    for minute in range(0, 24 * 60, 5):
        add(start + timedelta(minutes=minute, seconds=rng.randint(0, 3)), "GET", "/health", 200, 35)
    for hour in range(24):
        add(start + timedelta(hours=hour, minutes=0, seconds=30), "GET", "/admin/stats", 200, rng.randint(150, 160),
            agent="shopfront-dashboard/1.2", user="ada", auth="header", route="/admin/stats")
    for page in (1, 2):
        add(start + timedelta(hours=1, seconds=page * 2), "GET", f"/orders?page={page}&per_page=25", 200, 4100 if page == 1 else 2500,
            agent="python-urllib/3.13", route="/orders")
    work = [
        ("GET", "/users", 200, 1700, "-", None, "/users"),
        ("GET", "/users?q=van%20der&per_page=2", 200, 520, "-", None, "/users"),
        ("GET", "/users/3", 200, 140, "-", None, "/users/{id}"),
        ("GET", "/users/999", 404, 25, "-", None, "/users/{id}"),
        ("GET", "/tasks?owner=ada&done=false", 200, 900, "-", None, "/tasks"),
        ("POST", "/tasks", 201, 120, "ada", "header", "/tasks"),
        ("POST", "/tasks", 401, 37, "-", None, "/tasks"),
        ("PATCH", "/tasks/{n}", 200, 120, "grace", "header", "/tasks/{id}"),
        ("GET", "/orders/{n}", 200, 170, "-", None, "/orders/{id}"),
        ("GET", "/admin/stats", 401, 37, "-", None, "/admin/stats"),
        ("GET", "/flaky", 503, 66, "-", None, "/flaky"),
        ("GET", "/me", 401, 26, "-", None, "/me"),
    ]
    for _ in range(36):
        method, target, status, size, user, auth, route = rng.choice(work)
        target = target.replace("{n}", str(rng.randint(1, 40)))
        moment = start + timedelta(hours=rng.uniform(7.5, 18.5) if rng.random() < 0.85 else rng.uniform(0, 24))
        add(moment, method, target, status, size, user=user, auth=auth, route=route)
    add(start + timedelta(hours=10, minutes=12, seconds=4), "GET", "/users/13", 200, 141, secs=5.004, route="/users/{id}")
    add(start + timedelta(hours=6, minutes=40, seconds=11), "GET", "/boom", 500, 35, route="/boom")
    add(start + timedelta(hours=3, minutes=7), "GET", "/users/13", 200, 141, secs=5.003, route="/users/{id}")
    events.sort(key=lambda e: e[0])
    return events


def logs() -> None:
    rng = random.Random(1019)
    days = {date(2026, 10, 17): (24, 0), date(2026, 10, 18): (24, 0), date(2026, 10, 19): (8, 59)}
    access: dict[date, list[str]] = {}
    app_lines = [
        json.dumps({"ts": "2026-10-19T00:00:00.004Z", "level": "info", "msg": "reopened log files"}, separators=(",", ":"))
    ]
    for day, until in days.items():
        lines = []
        for moment, method, target, status, size, agent, user, auth, secs, route in day_of_traffic(day, until, rng):
            lines.append(f'127.0.0.1 - {user} [{clf(moment)}] "{method} {target} HTTP/1.1" {status} {size} "-" "{agent}" {secs:.3f}')
            if day == date(2026, 10, 19):
                level = "error" if status >= 500 else "warn" if status >= 400 or secs > 1 else "info"
                entry = {
                    "ts": iso_ms(moment + timedelta(seconds=secs)),
                    "level": level,
                    "method": method,
                    "route": route,
                    "status": status,
                    "ms": round(secs * 1000),
                    "msg": "slow request" if secs > 1 else "request",
                    "trace_id": f"{rng.getrandbits(64):016x}",
                }
                if user != "-":
                    entry.update(user=user, auth=auth)
                if route == "/boom":
                    crash = {
                        "ts": entry["ts"],
                        "level": "error",
                        "method": method,
                        "route": route,
                        "msg": "unhandled error: RuntimeError: boom: this route always fails, on purpose",
                        "trace_id": entry["trace_id"],
                    }
                    app_lines.append(json.dumps(crash, separators=(",", ":")))
                app_lines.append(json.dumps(entry, separators=(",", ":")))
        access[day] = lines
    write(OPS / "logs/api-access.log", "\n".join(access[date(2026, 10, 19)]) + "\n")
    write(OPS / "logs/api-access.log.1", "\n".join(access[date(2026, 10, 18)]) + "\n")
    buf = io.BytesIO()
    with gzip.GzipFile(filename="api-access.log.2", mode="wb", fileobj=buf, mtime=1792281599) as gz:
        gz.write(("\n".join(access[date(2026, 10, 17)]) + "\n").encode())
    write(OPS / "logs/api-access.log.2.gz", buf.getvalue())
    write(OPS / "logs/app.log", "\n".join(app_lines) + "\n")


def main() -> None:
    customer_rows, _ = data_files()
    releases(customer_rows)
    logs()


if __name__ == "__main__":
    main()
