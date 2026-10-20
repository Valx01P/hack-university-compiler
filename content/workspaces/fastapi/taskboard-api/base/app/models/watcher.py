"""Who watches a task: one row per task and user."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin

if TYPE_CHECKING:
    from app.models.task import Task
    from app.models.user import User


class TaskWatcher(CreatedAtMixin, Base):
    __tablename__ = "task_watchers"

    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )

    task: Mapped[Task] = relationship(back_populates="watchers")
    user: Mapped[User] = relationship()
