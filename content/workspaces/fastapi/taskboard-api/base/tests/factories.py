"""Builders for test rows. Each fills every required column with a sensible value, so a
test passes only what it is about: `make_task(db, project, status=TaskStatus.DONE)`.

The rows follow the contract (priorities 1 to 3, `due_on` dates) and go through the ORM,
so the hooks in `app/db/events.py` run as they do in the app. Every user gets the seed
password, hashed once per test run because Argon2 is slow on purpose.
"""

import itertools
from datetime import date
from functools import cache
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Comment,
    Membership,
    Project,
    ProjectRole,
    Tag,
    Task,
    TaskStatus,
    User,
    UserRole,
)

PASSWORD = "correct horse battery staple"

_numbers = itertools.count(1)


@cache
def password_hash() -> str:
    return hash_password(PASSWORD)


def make_user(db: Session, **overrides: Any) -> User:
    n = next(_numbers)
    fields: dict[str, Any] = {
        "email": f"user{n}@example.com",
        "name": f"User {n}",
        "role": UserRole.MEMBER,
        "hashed_password": password_hash(),
    }
    user = User(**(fields | overrides))
    db.add(user)
    db.flush()
    return user


def make_project(
    db: Session,
    owner: User,
    *,
    members: tuple[User, ...] = (),
    viewers: tuple[User, ...] = (),
    **overrides: Any,
) -> Project:
    """A project owned by `owner`, with `members` and `viewers` added in those roles."""
    n = next(_numbers)
    fields: dict[str, Any] = {
        "name": f"Project {n}",
        "color": "#2563eb",
        "start_date": date(2026, 9, 1),
        "owner_id": owner.id,
    }
    project = Project(**(fields | overrides))
    project.memberships.append(Membership(user=owner, role=ProjectRole.OWNER))
    project.memberships.extend(Membership(user=user, role=ProjectRole.MEMBER) for user in members)
    project.memberships.extend(Membership(user=user, role=ProjectRole.VIEWER) for user in viewers)
    db.add(project)
    db.flush()
    return project


def make_task(db: Session, project: Project, **overrides: Any) -> Task:
    """A todo task (priority 2) at the end of its column, unless the test says otherwise."""
    n = next(_numbers)
    status = overrides.get("status", TaskStatus.TODO)
    in_column = select(func.count()).where(Task.project_id == project.id, Task.status == status)
    fields: dict[str, Any] = {
        "project_id": project.id,
        "title": f"Task {n}",
        "priority": 2,
        "status": status,
        "position": db.scalar(in_column),
    }
    task = Task(**(fields | overrides))
    db.add(task)
    db.flush()
    return task


def make_comment(db: Session, task: Task, author: User, **overrides: Any) -> Comment:
    n = next(_numbers)
    comment = Comment(
        **({"task_id": task.id, "author_id": author.id, "body": f"Comment {n}"} | overrides)
    )
    db.add(comment)
    db.flush()
    return comment


def make_tag(db: Session, name: str, *tasks: Task) -> Tag:
    tag = Tag(name=name)
    db.add(tag)
    for task in tasks:
        task.tags.append(tag)
    db.flush()
    return tag
