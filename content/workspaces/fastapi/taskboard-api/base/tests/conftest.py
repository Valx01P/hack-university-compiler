"""Fixtures every test can use.

The test database (TEST_DATABASE_URL) is migrated to the latest revision once per run and
emptied. Then each test runs inside one transaction that is rolled back at the end: the
session joins it with `join_transaction_mode="create_savepoint"`, so when app code calls
`session.commit()` it only releases a SAVEPOINT, and nothing a test writes is left for the
next test. Tests can run in any order.

- `db`: the session, with the fixed clock and a mail log in the test's temporary folder.
- `client`: a TestClient for an app whose `get_session` and `get_clock` use the above.
- `auth_headers(user)`: an Authorization header with a real token for `user`.
- `seeded`: the contract's seed rows (`scripts/seed.json`), loaded into this test's transaction.
- `count_queries()`: counts the SQL statements run inside a `with` block.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event, make_url, text
from sqlalchemy.orm import Session

from app.core.clock import Clock, get_clock
from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_session
from app.main import create_app
from app.models import User
from scripts import seed
from tests.factories import password_hash

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
CLOCK = Clock(fixed=NOW)

AuthHeaders = Callable[[User], dict[str, str]]


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = make_url(get_settings().test_database_url)
    if not (url.database or "").endswith("test"):
        pytest.exit(
            f"TEST_DATABASE_URL names {url.database!r}: use a database whose name ends in test"
        )
    engine = create_engine(url, connect_args={"options": "-c timezone=UTC"})
    with engine.begin() as connection:
        config = Config(toml_file=str(ROOT / "pyproject.toml"))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        tables = ", ".join(table.name for table in reversed(Base.metadata.sorted_tables))
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine, tmp_path: Path) -> Iterator[Session]:
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
            info={"clock": CLOCK, "mail_log": tmp_path / "mail.log"},
        )
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def mail_log(db: Session) -> Path:
    return db.info["mail_log"]


@pytest.fixture
def app(db: Session) -> FastAPI:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_clock] = lambda: CLOCK
    return app


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth_headers() -> AuthHeaders:
    def headers(user: User) -> dict[str, str]:
        token = create_access_token(user.id, clock=CLOCK, settings=get_settings())
        return {"Authorization": f"Bearer {token.token}"}

    return headers


@pytest.fixture
def seeded(db: Session) -> dict[str, Any]:
    """The Taskboard contract's rows, with their ids: Ada is user 1, Website Relaunch project 1."""
    data = seed.read_seed()
    seed.load(db, data, password_hash=password_hash())
    db.flush()
    return data


@pytest.fixture
def count_queries(engine: Engine, db: Session) -> Callable[[], Any]:
    """`with count_queries() as statements: ...`, then `len(statements)`.

    The block starts with an empty identity map, like a real request's new session, so a
    lazy load cannot hide behind an object an earlier step loaded. SAVEPOINT statements from
    the test's own transaction are left out.
    """

    @contextmanager
    def counting() -> Iterator[list[str]]:
        db.expunge_all()
        statements: list[str] = []

        def record(_conn: object, _cursor: object, statement: str, *_args: object) -> None:
            if not statement.lstrip().upper().startswith(("SAVEPOINT", "RELEASE", "ROLLBACK TO")):
                statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            yield statements
        finally:
            event.remove(engine, "before_cursor_execute", record)

    return counting
