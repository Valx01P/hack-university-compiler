"""Hooks that run before rows reach the database: slugs, timestamps, and the audit log.

They run for every write that goes through the ORM, whether it comes from a route, a
script, or a test, so no service can forget them. Importing this module registers them
(`app/db/session.py` does).

- `assign_slug`, a mapper hook on `Project` (`before_insert`): a URL-safe slug from the
  name, unique across projects (`website`, `website-2`, ...). Renaming keeps the slug.
- `stamp_and_audit`, a session hook (`before_flush`): sets `created_at` and `updated_at`
  from the clock, and adds an `AuditLog` row for every changed or deleted task, in the
  same transaction as the change.
"""

import re
import unicodedata
from datetime import date, datetime
from enum import Enum
from typing import Any

from sqlalchemy import Connection, event, inspect, or_, select
from sqlalchemy.orm import Mapper, Session

from app.core.clock import Clock, get_clock
from app.core.context import current_request_id, current_user_id
from app.db.base import CreatedAtMixin, TimestampMixin
from app.models.audit import AuditLog
from app.models.project import Project
from app.models.task import Task

# Bookkeeping columns that change on every write, so they would only add noise.
_NOT_AUDITED = {"updated_at", "version"}


def slugify(text: str) -> str:
    """`"Café Menu!"` becomes `"cafe-menu"`: accents dropped, lowercase, dashes between words."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def clock_for(session: Session) -> Clock:
    """The clock the session was opened with (`get_session` puts it in `session.info`)."""
    return session.info.get("clock") or get_clock()


@event.listens_for(Project, "before_insert")
def assign_slug(_mapper: Mapper[Project], connection: Connection, project: Project) -> None:
    if project.slug:
        return
    base = slugify(project.name) or "project"
    taken = set(
        connection.scalars(
            select(Project.slug).where(
                or_(Project.slug == base, Project.slug.startswith(f"{base}-"))
            )
        )
    )
    slug, suffix = base, 2
    while slug in taken:
        slug, suffix = f"{base}-{suffix}", suffix + 1
    project.slug = slug


def _jsonable(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return value


def task_changes(task: Task) -> dict[str, list[Any]]:
    """`{"title": [old, new], ...}` for every column of `task` changed since it was loaded."""
    changes: dict[str, list[Any]] = {}
    for attribute in inspect(task).mapper.column_attrs:
        if attribute.key in _NOT_AUDITED:
            continue
        history = inspect(task).attrs[attribute.key].history
        if history.has_changes():
            old = history.deleted[0] if history.deleted else None
            new = history.added[0] if history.added else None
            if old != new:
                changes[attribute.key] = [_jsonable(old), _jsonable(new)]
    return changes


def _audit(session: Session, action: str, task: Task, changes: dict[str, Any]) -> None:
    session.add(
        AuditLog(
            actor_id=current_user_id(),
            action=action,
            entity="task",
            entity_id=task.id,
            changes=changes,
            request_id=current_request_id(),
        )
    )


@event.listens_for(Session, "before_flush")
def stamp_and_audit(session: Session, _flush_context: object, _instances: object) -> None:
    now = clock_for(session).now()

    for obj in session.new:
        if isinstance(obj, CreatedAtMixin) and obj.created_at is None:
            obj.created_at = now
        if isinstance(obj, TimestampMixin) and obj.updated_at is None:
            obj.updated_at = obj.created_at

    for obj in session.dirty:
        if not session.is_modified(obj, include_collections=False):
            continue
        if isinstance(obj, Task) and (changes := task_changes(obj)):
            _audit(session, "task.updated", obj, changes)
        if isinstance(obj, TimestampMixin):
            obj.updated_at = now

    for obj in session.deleted:
        if isinstance(obj, Task):
            _audit(session, "task.deleted", obj, {"title": [obj.title, None]})
