"""Comments on a task, listed oldest first."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Identity, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.task import Task
    from app.models.user import User


class Comment(TimestampMixin, Base):
    __tablename__ = "comments"
    __table_args__ = (
        # Serves the keyset page query: WHERE task_id = ? AND (created_at, id) > (?, ?).
        Index("ix_comments_task_id_created_at_id", "task_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(String(2000))

    task: Mapped[Task] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
