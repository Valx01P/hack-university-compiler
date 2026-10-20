"""Watchers: the list, watching and unwatching (idempotent), and who may change them.

This is the reference feature lesson 43 tours: one migration (0005), a model, a repository,
a service, a router, and these tests.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import TaskWatcher, User
from tests.conftest import AuthHeaders
from tests.factories import make_project, make_task, make_user

ADA, GRACE, LINUS, MARGARET = 1, 2, 3, 4


@pytest.fixture
def people(db: Session, seeded: dict[str, Any]) -> dict[int, User]:
    return {user_id: db.get(User, user_id) for user_id in (ADA, GRACE, LINUS, MARGARET)}


def watcher_ids(client: TestClient, task_id: int, headers: dict[str, str]) -> list[int]:
    return [
        user["id"] for user in client.get(f"/v1/tasks/{task_id}/watchers", headers=headers).json()
    ]


def test_watchers_are_listed_by_user_id_without_emails(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Each watcher is `{id, name}`, sorted by id. A task nobody watches gives `[]`."""
    headers = auth_headers(people[GRACE])

    assert client.get("/v1/tasks/1/watchers", headers=headers).json() == [
        {"id": 1, "name": "Ada Lovelace"},
        {"id": 2, "name": "Grace Hopper"},
    ]
    assert client.get("/v1/tasks/2/watchers", headers=headers).json() == []


def test_watching_twice_and_unwatching_twice_change_nothing(
    client: TestClient, db: Session, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """PUT and DELETE are idempotent: always 204, and at most one row per task and user."""
    headers = auth_headers(people[GRACE])
    rows = select(func.count()).select_from(TaskWatcher).where(TaskWatcher.task_id == 3)

    puts = [client.put("/v1/tasks/3/watchers/2", headers=headers).status_code for _ in range(2)]
    after_put = watcher_ids(client, 3, headers)
    count_after_put = db.scalar(rows)
    deletes = [
        client.delete("/v1/tasks/3/watchers/2", headers=headers).status_code for _ in range(2)
    ]

    assert puts == deletes == [204, 204]
    assert (after_put, count_after_put) == ([1, 2], 2)
    assert watcher_ids(client, 3, headers) == [1]


def test_members_can_add_other_members(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A member may make another member of the project watch a task."""
    owner, member = make_user(db), make_user(db)
    task = make_task(db, make_project(db, owner, members=(member,)))

    response = client.put(f"/v1/tasks/{task.id}/watchers/{owner.id}", headers=auth_headers(member))

    assert response.status_code == 204
    assert watcher_ids(client, task.id, auth_headers(member)) == [owner.id]


@pytest.mark.parametrize(
    ("user_id", "status"),
    [("3", 422), ("999", 422), ("abc", 400)],
    ids=["outsider", "nobody", "not-an-id"],
)
def test_the_watcher_must_be_a_member(
    client: TestClient,
    people: dict[int, User],
    auth_headers: AuthHeaders,
    user_id: str,
    status: int,
) -> None:
    """Someone outside the project, or nobody at all, is a 422 naming user_id. Not a number: 400."""
    response = client.put(f"/v1/tasks/3/watchers/{user_id}", headers=auth_headers(people[GRACE]))

    assert response.status_code == status
    assert "user_id" in response.json()["errors"]


def test_who_may_see_and_change_watchers(
    client: TestClient, db: Session, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A stranger gets 404. An outside admin and a viewer read, but get 403 for changes."""
    viewer = make_user(db)
    project = make_project(db, people[LINUS], viewers=(viewer,))
    task = make_task(db, project)

    assert (
        client.get("/v1/tasks/1/watchers", headers=auth_headers(people[MARGARET])).status_code
        == 404
    )
    assert client.get("/v1/tasks/16/watchers", headers=auth_headers(people[ADA])).status_code == 200
    assert (
        client.put("/v1/tasks/16/watchers/1", headers=auth_headers(people[ADA])).status_code == 403
    )
    assert (
        client.get(f"/v1/tasks/{task.id}/watchers", headers=auth_headers(viewer)).status_code == 200
    )
    assert (
        client.put(
            f"/v1/tasks/{task.id}/watchers/{viewer.id}", headers=auth_headers(viewer)
        ).status_code
        == 403
    )


def test_deleting_a_task_removes_its_watchers(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """Watcher rows go with their task (ON DELETE CASCADE)."""
    owner = make_user(db)
    task = make_task(db, make_project(db, owner))
    client.put(f"/v1/tasks/{task.id}/watchers/{owner.id}", headers=auth_headers(owner))

    client.delete(f"/v1/tasks/{task.id}", headers=auth_headers(owner))

    assert (
        db.scalar(
            select(func.count()).select_from(TaskWatcher).where(TaskWatcher.task_id == task.id)
        )
        == 0
    )
