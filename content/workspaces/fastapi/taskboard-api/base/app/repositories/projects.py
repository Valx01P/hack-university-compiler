"""Queries about projects, their members, and their task counts."""

from typing import NamedTuple

from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import Conflict
from app.models.project import Membership, Project, ProjectRole
from app.models.task import Task, TaskStatus
from app.models.user import User


class ProjectRow(NamedTuple):
    project: Project
    role: ProjectRole
    counts: dict[TaskStatus, int]


def _counts_by_project():
    """One grouped query: each project's id and its number of tasks in each status."""
    return (
        select(
            Task.project_id,
            *(
                func.count().filter(Task.status == status).label(status.value)
                for status in TaskStatus
            ),
        )
        .group_by(Task.project_id)
        .subquery("task_counts")
    )


def list_for_user(session: Session, user_id: int) -> list[ProjectRow]:
    """The projects `user_id` is a member of, by id, with their role and task counts."""
    counts = _counts_by_project()
    statement = (
        select(Project, Membership.role, *(func.coalesce(counts.c[s.value], 0) for s in TaskStatus))
        .join(Membership, (Membership.project_id == Project.id) & (Membership.user_id == user_id))
        .outerjoin(counts, counts.c.project_id == Project.id)
        .order_by(Project.id)
    )
    return [
        ProjectRow(project, role, dict(zip(TaskStatus, numbers, strict=True)))
        for project, role, *numbers in session.execute(statement)
    ]


def get(session: Session, project_id: int) -> Project | None:
    return session.get(Project, project_id)


def get_with_members(session: Session, project_id: int) -> Project | None:
    statement = (
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.memberships).joinedload(Membership.user))
    )
    return session.scalar(statement)


def get_by_slug(session: Session, slug: str) -> Project | None:
    return session.scalar(select(Project).where(Project.slug == slug))


def name_taken(
    session: Session, owner_id: int, name: str, *, exclude_id: int | None = None
) -> bool:
    """Whether `owner_id` already has a project called `name`, in any letter case."""
    condition = (Project.owner_id == owner_id) & (func.lower(Project.name) == name.lower())
    if exclude_id is not None:
        condition &= Project.id != exclude_id
    return bool(session.scalar(select(exists().where(condition))))


def _name_conflict(error: IntegrityError) -> Conflict | None:
    """The unique index on (owner_id, lower(name)) caught a name the owner already uses."""
    if "uq_projects_owner_id_lower_name" not in str(error.orig):
        return None
    return Conflict(
        "you already have a project with this name",
        errors={"name": "is already used by another of your projects"},
    )


def add(session: Session, project: Project) -> Project:
    """Inserts the project. The service checked the name, but a parallel request may have
    taken it since, so the database's unique index has the last word."""
    try:
        with session.begin_nested():
            session.add(project)
    except IntegrityError as error:
        if conflict := _name_conflict(error):
            raise conflict from error
        raise
    return project


def rename(session: Session, project: Project, name: str) -> Project:
    try:
        with session.begin_nested():
            project.name = name
    except IntegrityError as error:
        if conflict := _name_conflict(error):
            raise conflict from error
        raise
    return project


def role_of(session: Session, project_id: int, user_id: int) -> ProjectRole | None:
    statement = select(Membership.role).where(
        Membership.project_id == project_id, Membership.user_id == user_id
    )
    return session.scalar(statement)


def add_member(session: Session, project: Project, user: User, role: ProjectRole) -> Membership:
    membership = Membership(project=project, user=user, role=role)
    session.add(membership)
    session.flush()
    return membership
