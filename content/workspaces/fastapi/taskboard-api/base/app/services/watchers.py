"""Watcher rules: who may watch a task, and who may change its watchers."""

from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.errors import Unprocessable
from app.models.task import Task
from app.models.user import User
from app.repositories import projects, watchers


def list_watchers(session: Session, task: Task) -> list[User]:
    return watchers.list_for_task(session, task.id)


def watch(session: Session, task: Task, user_id: int, *, clock: Clock) -> None:
    """Adds a watcher, who must be a member of the task's project. Repeating it is a no-op."""
    if projects.role_of(session, task.project_id, user_id) is None:
        raise Unprocessable(
            f"user {user_id} is not a member of this task's project",
            errors={"user_id": "must be a member of the project"},
        )
    watchers.add(session, task.id, user_id, created_at=clock.now())
    session.commit()


def unwatch(session: Session, task: Task, user_id: int) -> None:
    watchers.remove(session, task.id, user_id)
    session.commit()
