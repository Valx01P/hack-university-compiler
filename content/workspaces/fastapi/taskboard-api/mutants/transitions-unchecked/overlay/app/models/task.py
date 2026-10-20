"""Tasks, the statuses they move through, and which moves are allowed."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Identity, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, string_enum

if TYPE_CHECKING:
    from app.models.comment import Comment
    from app.models.project import Project
    from app.models.tag import Tag
    from app.models.user import User
    from app.models.watcher import TaskWatcher


class TaskStatus(StrEnum):
    TODO = "todo"
    DOING = "doing"
    DONE = "done"

    def can_transition_to(self, target: TaskStatus) -> bool:
        return target is not self


# todo -> doing or done, doing -> todo or done, and done -> doing (reopening). Never done -> todo.
TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    TaskStatus.TODO: frozenset({TaskStatus.DOING, TaskStatus.DONE}),
    TaskStatus.DOING: frozenset({TaskStatus.TODO, TaskStatus.DONE}),
    TaskStatus.DONE: frozenset({TaskStatus.DOING}),
}

LOW, MEDIUM, HIGH = 1, 2, 3


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("priority BETWEEN 1 AND 3", name="priority_range"),
        Index("ix_tasks_project_id_status_position", "project_id", "status", "position"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(2000))
    status: Mapped[TaskStatus] = mapped_column(
        string_enum(TaskStatus, "status"),
        default=TaskStatus.TODO,
        server_default=TaskStatus.TODO.value,
    )
    priority: Mapped[int] = mapped_column(SmallInteger, default=MEDIUM, server_default=str(MEDIUM))
    due_on: Mapped[date | None]
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    position: Mapped[int] = mapped_column(default=0, server_default="0")
    version: Mapped[int] = mapped_column(server_default="1")
    completed_at: Mapped[datetime | None]

    # Every UPDATE adds 1 to version and checks the old value in its WHERE clause, so two
    # requests that both read version 3 cannot both write: the second gets StaleDataError.
    __mapper_args__ = {"version_id_col": version}

    project: Mapped[Project] = relationship(back_populates="tasks")
    assignee: Mapped[User | None] = relationship()
    comments: Mapped[list[Comment]] = relationship(back_populates="task", passive_deletes=True)
    tags: Mapped[list[Tag]] = relationship(
        secondary="task_tags", order_by="Tag.name", passive_deletes=True
    )
    watchers: Mapped[list[TaskWatcher]] = relationship(back_populates="task", passive_deletes=True)

    @property
    def etag(self) -> str:
        return f'"v{self.version}"'

    def __repr__(self) -> str:
        return f"Task(id={self.id!r}, title={self.title!r}, status={self.status!r})"
