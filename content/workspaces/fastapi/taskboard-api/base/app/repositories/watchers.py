"""Queries about who watches a task."""

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.watcher import TaskWatcher


def list_for_task(session: Session, task_id: int) -> list[User]:
    """The users watching a task, by user id."""
    statement = (
        select(User)
        .join(TaskWatcher, TaskWatcher.user_id == User.id)
        .where(TaskWatcher.task_id == task_id)
        .order_by(User.id)
    )
    return list(session.scalars(statement))


def add(session: Session, task_id: int, user_id: int, *, created_at: datetime) -> None:
    """Idempotent: watching a task twice leaves one row (INSERT ... ON CONFLICT DO NOTHING)."""
    session.execute(
        insert(TaskWatcher)
        .values(task_id=task_id, user_id=user_id, created_at=created_at)
        .on_conflict_do_nothing(index_elements=[TaskWatcher.task_id, TaskWatcher.user_id])
    )


def remove(session: Session, task_id: int, user_id: int) -> None:
    """Idempotent: removing someone who does not watch the task changes nothing."""
    session.execute(
        delete(TaskWatcher).where(TaskWatcher.task_id == task_id, TaskWatcher.user_id == user_id)
    )
