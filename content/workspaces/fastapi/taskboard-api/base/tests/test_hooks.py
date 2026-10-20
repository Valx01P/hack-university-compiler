"""The hooks in app/db/events.py and on the models: they run for every write through the
ORM, whether it comes from a route, a script, or straight from a session."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.context import request_scope
from app.db.events import slugify
from app.models import AuditLog, Project, User
from tests.conftest import AuthHeaders
from tests.factories import make_project, make_task, make_user


def audit_rows(db: Session, task_id: int) -> list[AuditLog]:
    statement = (
        select(AuditLog)
        .where(AuditLog.entity == "task", AuditLog.entity_id == task_id)
        .order_by(AuditLog.id)
    )
    return list(db.scalars(statement))


def test_slugify_drops_accents_and_punctuation() -> None:
    """ "Café Menu!" becomes cafe-menu."""
    assert slugify("Café Menu!") == "cafe-menu"
    assert slugify("  Q4 -- Launch  Plan ") == "q4-launch-plan"


def test_projects_with_the_same_name_get_numbered_slugs(db: Session) -> None:
    """Three projects named Website, by different owners, get website, website-2, website-3."""
    projects = [make_project(db, make_user(db), name="Website") for _ in range(3)]

    assert [project.slug for project in projects] == ["website", "website-2", "website-3"]


def test_the_slug_hook_runs_for_rows_added_straight_to_the_session(db: Session) -> None:
    """No service involved: a Project added to the session still gets its slug before INSERT."""
    owner = make_user(db)
    project = Project(name="Café Menu!", owner_id=owner.id)
    db.add(project)
    db.flush()

    assert project.slug == "cafe-menu"


def test_renaming_keeps_the_slug(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """Saved links keep working: a rename never regenerates the slug."""
    owner = make_user(db)
    project = make_project(db, owner, name="Website")

    response = client.patch(
        f"/v1/projects/{project.id}", json={"name": "Website 2026"}, headers=auth_headers(owner)
    )

    assert response.json()["slug"] == "website"


def test_timestamps_come_from_the_clock(db: Session) -> None:
    """created_at and updated_at are the session clock's time, 2026-10-01T09:00:00Z."""
    user = make_user(db)

    assert user.created_at == user.updated_at == datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


def test_updated_at_moves_only_when_a_column_changes(db: Session) -> None:
    """Setting a column to the value it already has is not a change."""
    user = make_user(
        db, created_at=datetime(2026, 9, 1, tzinfo=UTC), updated_at=datetime(2026, 9, 1, tzinfo=UTC)
    )

    user.name = user.name
    db.flush()
    unchanged = user.updated_at
    user.name = "Someone Else"
    db.flush()

    assert unchanged == datetime(2026, 9, 1, tzinfo=UTC)
    assert user.updated_at == datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


def test_emails_are_normalized_by_the_model(db: Session) -> None:
    """@validates trims and lowercases an email however it is set."""
    user = make_user(db, email="  Grace@Example.COM ")

    assert user.email == "grace@example.com"
    assert db.scalar(select(User.id).where(User.email == "grace@example.com")) == user.id


def test_editing_a_task_writes_an_audit_row(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """One task.updated row: each changed column as [old, new], the actor, the request id."""
    owner = make_user(db)
    task = make_task(db, make_project(db, owner), title="Old title")

    response = client.patch(
        f"/v1/tasks/{task.id}",
        json={"title": "New title", "priority": 3},
        headers=auth_headers(owner)
        | {"If-Match": '"v1"', "X-Request-ID": "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"},
    )

    assert response.status_code == 200
    [row] = audit_rows(db, task.id)
    assert (row.action, row.actor_id, row.request_id) == (
        "task.updated",
        owner.id,
        "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    )
    assert row.changes == {"title": ["Old title", "New title"], "priority": [2, 3]}


def test_status_changes_are_audited_like_any_column(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A transition records the status, the position, and completed_at as they changed."""
    owner = make_user(db)
    task = make_task(db, make_project(db, owner))

    client.post(f"/v1/tasks/{task.id}/transition", json={"to": "done"}, headers=auth_headers(owner))

    [row] = audit_rows(db, task.id)
    assert row.changes["status"] == ["todo", "done"]
    assert row.changes["completed_at"] == [None, "2026-10-01T09:00:00Z"]


def test_nothing_is_audited_when_nothing_changes_or_the_change_rolls_back(db: Session) -> None:
    """No row for a no-op, and a rolled back change takes its audit row with it."""
    owner = make_user(db)
    task = make_task(db, make_project(db, owner), title="Same")

    task.title = "Same"
    db.flush()
    with request_scope("req-1", user_id=owner.id):
        savepoint = db.begin_nested()
        task.title = "Changed"
        db.flush()
        savepoint.rollback()

    assert audit_rows(db, task.id) == []


def test_deleting_a_task_is_audited(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A task.deleted row keeps the title of the task that is gone."""
    owner = make_user(db)
    task = make_task(db, make_project(db, owner), title="Short-lived")

    client.delete(f"/v1/tasks/{task.id}", headers=auth_headers(owner))

    [row] = audit_rows(db, task.id)
    assert (row.action, row.changes, row.actor_id) == (
        "task.deleted",
        {"title": ["Short-lived", None]},
        owner.id,
    )


def test_every_response_carries_a_request_id(client: TestClient) -> None:
    """A valid incoming X-Request-ID is echoed. Otherwise the server makes a UUIDv7."""
    given = client.get("/healthz", headers={"X-Request-ID": "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"})
    made = client.get("/healthz", headers={"X-Request-ID": "not a uuid"})

    assert given.headers["x-request-id"] == "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
    assert made.headers["x-request-id"][14] == "7"  # the version digit of a UUIDv7


def test_problems_carry_the_request_id(client: TestClient) -> None:
    """Every problem body names its request, so a support ticket can quote it."""
    response = client.get(
        "/v1/me", headers={"X-Request-ID": "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"}
    )

    assert response.json()["request_id"] == "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
