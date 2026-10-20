"""Comments: pages oldest first by cursor, writing, editing, and deleting, and who may."""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Project, User
from tests.conftest import AuthHeaders
from tests.factories import make_comment, make_project, make_task, make_user

ADA, GRACE, LINUS, MARGARET = 1, 2, 3, 4


@pytest.fixture
def people(db: Session, seeded: dict[str, Any]) -> dict[int, User]:
    return {user_id: db.get(User, user_id) for user_id in (ADA, GRACE, LINUS, MARGARET)}


@pytest.fixture
def team(db: Session) -> tuple[User, User, Project]:
    owner, member = make_user(db), make_user(db)
    return owner, member, make_project(db, owner, members=(member,))


def comment_ids(response) -> list[int]:
    return [comment["id"] for comment in response.json()["items"]]


def test_pages_walk_every_comment_once_in_order(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Task 1's 23 comments come 10, 10, then 3, oldest first, though 10 and 11 share a time."""
    headers = auth_headers(people[GRACE])
    seen: list[int] = []
    cursor = None
    pages = 0
    while True:
        params = {"limit": 10} | ({"cursor": cursor} if cursor else {})
        body = client.get("/v1/tasks/1/comments", params=params, headers=headers).json()
        seen += [comment["id"] for comment in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break

    assert pages == 3
    assert seen == list(range(1, 24))


def test_a_comment_shows_its_author_without_an_email(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """The author is `{id, name}`: emails never leak through comments."""
    first = client.get("/v1/tasks/1/comments?limit=1", headers=auth_headers(people[GRACE])).json()[
        "items"
    ][0]

    assert first == {
        "id": 1,
        "task_id": 1,
        "author": {"id": 1, "name": "Ada Lovelace"},
        "body": "I can reproduce it: open /projects/2 signed out, sign in, and you land on /.",
        "created_at": "2026-09-15T09:00:00Z",
    }


def test_the_default_page_is_20_and_an_empty_task_has_no_cursor(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """20 comments by default, and a task without any gives `{"items": [], "next_cursor": null}`."""
    headers = auth_headers(people[ADA])

    assert len(client.get("/v1/tasks/1/comments", headers=headers).json()["items"]) == 20
    assert client.get("/v1/tasks/2/comments", headers=headers).json() == {
        "items": [],
        "next_cursor": None,
    }


def test_a_comment_added_between_pages_is_neither_lost_nor_repeated(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Keyset paging: a new comment shows up at the end, and no earlier comment repeats."""
    owner, _, project = team
    task = make_task(db, project)
    for minute in range(4):
        make_comment(db, task, owner, created_at=datetime(2026, 9, 20, 9, minute, tzinfo=UTC))
    headers = auth_headers(owner)

    first = client.get(f"/v1/tasks/{task.id}/comments?limit=2", headers=headers).json()
    client.post(f"/v1/tasks/{task.id}/comments", json={"body": "Late arrival"}, headers=headers)
    rest = client.get(
        f"/v1/tasks/{task.id}/comments", params={"cursor": first["next_cursor"]}, headers=headers
    ).json()

    bodies = [c["body"] for c in first["items"] + rest["items"]]
    assert len(bodies) == len({c["id"] for c in first["items"] + rest["items"]}) == 5
    assert bodies[-1] == "Late arrival"


@pytest.mark.parametrize(
    "query",
    ["cursor=not-a-cursor", "limit=0", "limit=101", "cursor=e30"],
    ids=["garbage", "zero", "big", "empty-key"],
)
def test_bad_cursors_and_limits_are_400s(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders, query: str
) -> None:
    """A cursor the server never issued, or a limit outside 1 to 100, is a 400 problem."""
    response = client.get(f"/v1/tasks/1/comments?{query}", headers=auth_headers(people[GRACE]))

    assert response.status_code == 400


def test_the_list_runs_the_same_statements_for_1_or_10_comments(
    client: TestClient,
    db: Session,
    team: tuple[User, User, Project],
    auth_headers: AuthHeaders,
    count_queries,
) -> None:
    """Authors load with the comments (a join), not one SELECT per comment."""
    owner, member, project = team
    one, ten = make_task(db, project), make_task(db, project)
    make_comment(db, one, member)
    # Ten different authors: one author for every comment would load once and hide an N+1.
    for author in [make_user(db) for _ in range(10)]:
        make_comment(db, ten, author)

    with count_queries() as for_one:
        client.get(f"/v1/tasks/{one.id}/comments", headers=auth_headers(owner))
    with count_queries() as for_ten:
        client.get(f"/v1/tasks/{ten.id}/comments", headers=auth_headers(owner))

    assert len(for_one) == len(for_ten)


def test_commenting_trims_the_body_and_stamps_the_author_and_time(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """The body is trimmed, the author is the caller, and the time is the clock's."""
    response = client.post(
        "/v1/tasks/1/comments",
        json={"body": "  Looks good to me.  "},
        headers=auth_headers(people[GRACE]),
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["body"], body["author"], body["created_at"]) == (
        "Looks good to me.",
        {"id": 2, "name": "Grace Hopper"},
        "2026-10-01T09:00:00Z",
    )


@pytest.mark.parametrize(
    "text", ["   ", "\u0007", "\t\r\n \u0000"], ids=["spaces", "bell", "controls-and-space"]
)
def test_an_empty_body_is_refused(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders, text: str
) -> None:
    """Control characters (but newlines) are removed, then a body with nothing left is a 422."""
    response = client.post(
        "/v1/tasks/1/comments", json={"body": text}, headers=auth_headers(people[GRACE])
    )

    assert response.status_code == 422
    assert response.json()["errors"] == {"body": "must not be empty"}


def test_newlines_survive_and_other_control_characters_do_not(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A newline is kept inside the body. A bell or a tab is removed."""
    response = client.post(
        "/v1/tasks/1/comments",
        json={"body": "First line\nsecond\u0007\tline"},
        headers=auth_headers(people[GRACE]),
    )

    assert response.json()["body"] == "First line\nsecondline"


def test_who_may_comment(
    client: TestClient, db: Session, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A stranger gets 404, an admin outside the project 403, and a viewer 403."""
    viewer = make_user(db)
    project = make_project(db, people[GRACE], viewers=(viewer,))
    task = make_task(db, project)
    body = {"body": "Hello"}

    stranger = client.post(
        "/v1/tasks/1/comments", json=body, headers=auth_headers(people[MARGARET])
    )
    admin = client.post("/v1/tasks/16/comments", json=body, headers=auth_headers(people[ADA]))
    viewing = client.post(f"/v1/tasks/{task.id}/comments", json=body, headers=auth_headers(viewer))

    assert (stranger.status_code, admin.status_code, viewing.status_code) == (404, 403, 403)


def test_authors_and_owners_delete_comments(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """The author deletes their own, a member cannot delete someone else's, the owner can."""
    author = client.delete("/v1/comments/2", headers=auth_headers(people[GRACE]))
    other_member = client.delete("/v1/comments/3", headers=auth_headers(people[GRACE]))
    owner = client.delete("/v1/comments/4", headers=auth_headers(people[ADA]))

    assert (author.status_code, other_member.status_code, owner.status_code) == (204, 403, 204)
    remaining = client.get("/v1/tasks/1/comments?limit=3", headers=auth_headers(people[ADA]))
    assert comment_ids(remaining) == [1, 3, 5]


def test_strangers_admins_and_missing_comments(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """An admin outside the project gets 403, a stranger 404, a missing comment 404."""
    admin = client.delete("/v1/comments/29", headers=auth_headers(people[ADA]))
    stranger = client.delete("/v1/comments/1", headers=auth_headers(people[MARGARET]))
    missing = client.delete("/v1/comments/999", headers=auth_headers(people[ADA]))

    assert (admin.status_code, stranger.status_code, missing.status_code) == (403, 404, 404)


def test_only_the_author_edits_a_comment(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Grace edits her comment 2. Ada, the owner, may delete it but not change its words."""
    edited = client.patch(
        "/v1/comments/2", json={"body": " Edited. "}, headers=auth_headers(people[GRACE])
    )
    by_owner = client.patch(
        "/v1/comments/2", json={"body": "Owner words"}, headers=auth_headers(people[ADA])
    )

    assert (edited.status_code, edited.json()["body"]) == (200, "Edited.")
    assert by_owner.status_code == 403
