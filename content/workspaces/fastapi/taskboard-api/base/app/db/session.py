"""The engine, the session factory, and the session dependency: one session per request.

`get_session` opens a session for the request and closes it afterwards, which rolls back
anything not committed. Services decide when to commit. Tests override `get_session` with
a session inside a transaction they roll back (see `tests/conftest.py`).
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.clock import ClockDep
from app.core.config import get_settings
from app.db import events  # noqa: F401  (registers the hooks on every session)

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
    # UTC for every timestamp PostgreSQL hands back, and no endless wait for a dead server.
    connect_args={"options": "-c timezone=UTC", "connect_timeout": 5},
)

# expire_on_commit=False keeps loaded values readable after commit, so a route can return
# the object it just saved without another SELECT.
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_engine() -> Engine:
    return engine


def get_session(clock: ClockDep) -> Iterator[Session]:
    with SessionLocal(info={"clock": clock, "mail_log": settings.mail_log}) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
