"""Projects, and who belongs to each one with which role."""

from __future__ import annotations

from datetime import date
from enum import IntEnum, StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Identity, Index, String, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, TimestampMixin, string_enum

if TYPE_CHECKING:
    from app.models.task import Task
    from app.models.user import User

DEFAULT_COLOR = "#64748b"


class RoleRank(IntEnum):
    """Roles in order of power. Compare ranks, never role names: "viewer" > "member" as text."""

    VIEWER = 1
    MEMBER = 2
    OWNER = 3


class ProjectRole(StrEnum):
    VIEWER = "viewer"
    MEMBER = "member"
    OWNER = "owner"

    @property
    def rank(self) -> RoleRank:
        return RoleRank[self.name]


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    color: Mapped[str] = mapped_column(
        String(7), default=DEFAULT_COLOR, server_default=DEFAULT_COLOR
    )
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    start_date: Mapped[date | None]
    archived: Mapped[bool] = mapped_column(default=False, server_default=false())
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    owner: Mapped[User] = relationship()
    memberships: Mapped[list[Membership]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Membership.user_id"
    )
    tasks: Mapped[list[Task]] = relationship(back_populates="project", passive_deletes=True)

    def __repr__(self) -> str:
        return f"Project(id={self.id!r}, slug={self.slug!r})"


# One owner cannot have two projects whose names differ only in letter case.
Index("uq_projects_owner_id_lower_name", Project.owner_id, func.lower(Project.name), unique=True)


class Membership(CreatedAtMixin, Base):
    __tablename__ = "memberships"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[ProjectRole] = mapped_column(
        string_enum(ProjectRole, "role"), default=ProjectRole.MEMBER
    )

    project: Mapped[Project] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()
