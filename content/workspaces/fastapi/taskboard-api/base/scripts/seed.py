"""Loads the Taskboard contract's rows, then this course's extras, into DATABASE_URL.

    uv run python -m scripts.seed

`scripts/seed.json` is the contract's `seed.json`, copied byte for byte: 4 users, 3
projects, 6 memberships, 18 tasks, 31 comments, and 6 watcher rows, all with fixed ids and
times. The extras are what only this course has: project slugs and start dates, task
positions, 6 tags on 15 tasks, and 5 audit rows for the tasks that were finished.

The script empties every table first, so running it again resets the data. Rows go in
with bulk INSERTs, which skip the ORM hooks in `app/db/events.py`: the seed sets every
column itself, including the times, so nothing depends on when it runs.
"""

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import insert, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.base import Base
from app.db.events import slugify
from app.models import (
    AuditLog,
    Comment,
    Membership,
    Project,
    Tag,
    Task,
    TaskWatcher,
    User,
    task_tags,
)

SEED_FILE = Path(__file__).with_name("seed.json")

START_DATES = {1: date(2026, 9, 1), 2: date(2026, 9, 1), 3: date(2026, 9, 15)}
TAGS = {
    "frontend": [3, 4, 8, 14, 15],
    "backend": [1, 9, 16, 18],
    "bug": [1, 12],
    "design": [3, 13, 14],
    "urgent": [1, 11, 16],
    "docs": [2, 7, 17],
}


def read_seed(path: Path = SEED_FILE) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def when(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def reset(session: Session) -> None:
    """Empties every table and restarts every id at 1."""
    tables = ", ".join(table.name for table in reversed(Base.metadata.sorted_tables))
    session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


def positions(tasks: list[dict[str, Any]]) -> dict[int, int]:
    """Each task's place in its column (project and status), 0, 1, 2, ... in id order."""
    seen: dict[tuple[int, str], int] = {}
    placed = {}
    for task in sorted(tasks, key=lambda row: row["id"]):
        column = (task["project_id"], task["status"])
        placed[task["id"]] = seen.get(column, 0)
        seen[column] = placed[task["id"]] + 1
    return placed


def load(
    session: Session, seed: dict[str, Any], *, password_hash: str | None = None
) -> dict[str, int]:
    """Inserts the seed into an empty database and returns how many rows each table got."""
    password_hash = password_hash or hash_password(seed["password"])
    projects = {row["id"]: row for row in seed["projects"]}
    tasks = {row["id"]: row for row in seed["tasks"]}

    session.execute(
        insert(User),
        [
            {
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "role": row["role"],
                "hashed_password": password_hash,
                "created_at": when(row["created_at"]),
                "updated_at": when(row["created_at"]),
            }
            for row in seed["users"]
        ],
    )
    session.execute(
        insert(Project),
        [
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "color": row["color"],
                "owner_id": row["owner_id"],
                "slug": slugify(row["name"]),
                "start_date": START_DATES.get(row["id"]),
                "created_at": when(row["created_at"]),
                "updated_at": when(row["created_at"]),
            }
            for row in seed["projects"]
        ],
    )
    session.execute(
        insert(Membership),
        [
            {**row, "created_at": when(projects[row["project_id"]]["created_at"])}
            for row in seed["project_members"]
        ],
    )
    placed = positions(seed["tasks"])
    session.execute(
        insert(Task),
        [
            {
                **{key: row[key] for key in ("id", "project_id", "title", "description", "status")},
                **{key: row[key] for key in ("priority", "assignee_id", "version")},
                "due_on": date.fromisoformat(row["due_on"]) if row["due_on"] else None,
                "completed_at": when(row["completed_at"]),
                "created_at": when(row["created_at"]),
                "updated_at": when(row["updated_at"]),
                "position": placed[row["id"]],
            }
            for row in seed["tasks"]
        ],
    )
    session.execute(
        insert(Comment),
        [
            {**row, "created_at": when(row["created_at"]), "updated_at": when(row["created_at"])}
            for row in seed["comments"]
        ],
    )
    session.execute(
        insert(TaskWatcher),
        [
            {**row, "created_at": when(tasks[row["task_id"]]["created_at"])}
            for row in seed["task_watchers"]
        ],
    )

    # This course's extras, which no contract route returns.
    session.execute(insert(Tag), [{"id": n, "name": name} for n, name in enumerate(TAGS, start=1)])
    session.execute(
        insert(task_tags),
        [
            {"task_id": task_id, "tag_id": n}
            for n, task_ids in enumerate(TAGS.values(), start=1)
            for task_id in task_ids
        ],
    )
    finished = [row for row in seed["tasks"] if row["status"] == "done"]
    session.execute(
        insert(AuditLog),
        [
            {
                "actor_id": row["assignee_id"],
                "action": "task.updated",
                "entity": "task",
                "entity_id": row["id"],
                "changes": {
                    "status": ["doing", "done"],
                    "completed_at": [None, row["completed_at"]],
                },
                "created_at": when(row["completed_at"]),
            }
            for row in finished
        ],
    )

    # The rows above carry their own ids, so move each id sequence past the largest one.
    for table in ("users", "projects", "tasks", "comments", "tags", "audit_log", "outbox_messages"):
        session.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"coalesce((SELECT max(id) FROM {table}), 0) + 1, false)"
            )
        )
    return {
        "users": len(seed["users"]),
        "projects": len(seed["projects"]),
        "memberships": len(seed["project_members"]),
        "tasks": len(seed["tasks"]),
        "comments": len(seed["comments"]),
        "watchers": len(seed["task_watchers"]),
        "tags": len(TAGS),
        "audit rows": len(finished),
    }


def main() -> None:
    from app.db.session import SessionLocal

    seed = read_seed()
    with SessionLocal() as session:
        reset(session)
        counts = load(session, seed)
        session.commit()
    summary = ", ".join(f"{number} {name}" for name, number in counts.items())
    print(f"Loaded the Taskboard seed {seed['version']}: {summary}")


if __name__ == "__main__":
    main()
