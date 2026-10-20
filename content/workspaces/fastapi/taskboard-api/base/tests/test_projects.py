"""Projects: lists with task counts, who sees what, creating, renaming, members, stats, and
the board."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import TaskStatus, User, UserRole
from tests.conftest import AuthHeaders
from tests.factories import make_comment, make_project, make_tag, make_task, make_user

ADA, GRACE, LINUS, MARGARET = 1, 2, 3, 4


@pytest.fixture
def people(db: Session, seeded: dict[str, Any]) -> dict[int, User]:
    """The four seed users by id: Ada (admin), Grace, Linus, and Margaret (in no project)."""
    return {user_id: db.get(User, user_id) for user_id in (ADA, GRACE, LINUS, MARGARET)}


def test_list_shows_my_projects_with_role_and_task_counts(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Ada sees her two memberships, by id, with her role and each project's task counts."""
    response = client.get("/v1/projects", headers=auth_headers(people[ADA]))

    assert response.status_code == 200
    first, second = response.json()
    assert first == {
        "id": 1,
        "name": "Website Relaunch",
        "description": "Redesign and relaunch the marketing site before the November campaign.",
        "color": "#2563eb",
        "owner_id": 1,
        "created_at": "2026-09-01T09:00:00Z",
        "slug": "website-relaunch",
        "start_date": "2026-09-01",
        "archived": False,
        "role": "owner",
        "task_counts": {"todo": 3, "doing": 3, "done": 2},
    }
    assert (second["id"], second["role"], second["task_counts"]) == (
        2,
        "member",
        {"todo": 2, "doing": 3, "done": 2},
    )


def test_list_is_an_empty_array_for_someone_in_no_project(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Margaret belongs to no project: `[]`, never null."""
    assert client.get("/v1/projects", headers=auth_headers(people[MARGARET])).json() == []


def test_list_runs_the_same_statements_for_one_project_or_many(
    client: TestClient, db: Session, auth_headers: AuthHeaders, count_queries
) -> None:
    """Task counts come from one grouped query, not one query per project."""
    one, many = make_user(db), make_user(db)
    make_task(db, make_project(db, one))
    for _ in range(6):
        make_task(db, make_project(db, many))

    with count_queries() as for_one:
        client.get("/v1/projects", headers=auth_headers(one))
    with count_queries() as for_many:
        client.get("/v1/projects", headers=auth_headers(many))

    assert len(for_one) == len(for_many)


def test_a_project_shows_its_members_sorted_by_user_id(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Members come with name, email, and role, by user id."""
    response = client.get("/v1/projects/2", headers=auth_headers(people[LINUS]))

    members = response.json()["members"]
    assert [(m["user_id"], m["role"]) for m in members] == [
        (1, "member"),
        (2, "owner"),
        (3, "member"),
    ]
    assert members[0] == {
        "user_id": 1,
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "role": "member",
    }


@pytest.mark.parametrize(
    ("user_id", "project_id", "status"),
    [
        (GRACE, 1, 200),
        (ADA, 3, 200),
        (MARGARET, 1, 404),
        (LINUS, 1, 404),
    ],
    ids=["member", "admin-reads-any", "stranger", "other-projects-member"],
)
def test_who_can_see_a_project(
    client: TestClient,
    people: dict[int, User],
    auth_headers: AuthHeaders,
    user_id: int,
    project_id: int,
    status: int,
) -> None:
    """Members and admins see a project. Everyone else gets 404, never 403."""
    response = client.get(f"/v1/projects/{project_id}", headers=auth_headers(people[user_id]))

    assert response.status_code == status


def test_path_ids_must_be_numbers(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A project id that is not a number is a 400 problem naming project_id."""
    response = client.get("/v1/projects/abc", headers=auth_headers(people[ADA]))

    assert response.status_code == 400
    assert "project_id" in response.json()["errors"]


def test_create_trims_the_name_and_makes_the_creator_owner(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A new project gets the default color, a slug, a Location header, and its creator as owner."""
    user = make_user(db, name="Margaret Hamilton")

    response = client.post(
        "/v1/projects", json={"name": "  Launch Plan "}, headers=auth_headers(user)
    )

    assert response.status_code == 201
    body = response.json()
    assert response.headers["location"] == f"/v1/projects/{body['id']}"
    assert (body["name"], body["slug"], body["color"], body["description"]) == (
        "Launch Plan",
        "launch-plan",
        "#64748b",
        None,
    )
    assert body["owner_id"] == user.id
    assert body["created_at"] == "2026-10-01T09:00:00Z"
    assert body["members"] == [
        {"user_id": user.id, "name": "Margaret Hamilton", "email": user.email, "role": "owner"}
    ]


def test_names_are_unique_per_owner_in_any_letter_case(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """The same owner cannot reuse a name in other letters (409), but another owner can."""
    owner, other = make_user(db), make_user(db)
    client.post("/v1/projects", json={"name": "Launch Plan"}, headers=auth_headers(owner))

    again = client.post("/v1/projects", json={"name": "launch plan"}, headers=auth_headers(owner))
    elsewhere = client.post(
        "/v1/projects", json={"name": "Launch Plan"}, headers=auth_headers(other)
    )

    assert again.status_code == 409
    assert again.json()["errors"] == {"name": "is already used by another of your projects"}
    assert elsewhere.status_code == 201
    assert elsewhere.json()["slug"] == "launch-plan-2"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"name": "ab"}, "name"),
        ({"name": "Colors", "color": "orange"}, "color"),
        ({"name": "Long", "description": "x" * 501}, "description"),
    ],
    ids=["short-name", "bad-color", "long-description"],
)
def test_create_rejects_invalid_fields(
    client: TestClient, db: Session, auth_headers: AuthHeaders, body: dict[str, str], field: str
) -> None:
    """Rule breaks in the body are 422 problems that name the field."""
    response = client.post("/v1/projects", json=body, headers=auth_headers(make_user(db)))

    assert response.status_code == 422
    assert field in response.json()["errors"]


def test_owners_rename_and_others_cannot(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Owner: 200. Member: 403. Admin outside the project: 403. Stranger: 404."""
    rename = {"name": "Website Relaunch 2026"}

    def patch(user_id: int, project_id: int = 1) -> int:
        return client.patch(
            f"/v1/projects/{project_id}", json=rename, headers=auth_headers(people[user_id])
        ).status_code

    assert (patch(GRACE), patch(LINUS), patch(ADA, project_id=3)) == (403, 404, 403)
    owner = client.patch("/v1/projects/1", json=rename, headers=auth_headers(people[ADA]))
    assert owner.status_code == 200
    assert owner.json()["name"] == "Website Relaunch 2026"
    assert owner.json()["slug"] == "website-relaunch"


def test_rename_to_a_name_the_owner_uses_is_a_conflict(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """Renaming onto another of the owner's names, in any case, is a 409."""
    owner = make_user(db)
    make_project(db, owner, name="Launch Plan")
    retro = make_project(db, owner, name="Retro")

    response = client.patch(
        f"/v1/projects/{retro.id}", json={"name": "LAUNCH PLAN"}, headers=auth_headers(owner)
    )

    assert response.status_code == 409


def test_update_needs_a_field_and_refuses_null_names(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """An empty body and a null name are 422s. A null description clears it."""
    owner = make_user(db)
    project = make_project(db, owner, description="Old words")
    url, headers = f"/v1/projects/{project.id}", auth_headers(owner)

    assert client.patch(url, json={}, headers=headers).status_code == 422
    assert client.patch(url, json={"name": None}, headers=headers).status_code == 422
    assert (
        client.patch(url, json={"description": None}, headers=headers).json()["description"] is None
    )


def test_owners_add_members(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A new member defaults to the member role. A second add is 409, an unknown user 422."""
    ada = auth_headers(people[ADA])

    added = client.post("/v1/projects/1/members", json={"user_id": MARGARET}, headers=ada)
    again = client.post("/v1/projects/1/members", json={"user_id": MARGARET}, headers=ada)
    unknown = client.post("/v1/projects/1/members", json={"user_id": 999}, headers=ada)
    bad_role = client.post(
        "/v1/projects/1/members", json={"user_id": LINUS, "role": "boss"}, headers=ada
    )

    assert added.status_code == 201
    assert added.json() == {
        "user_id": 4,
        "name": "Margaret Hamilton",
        "email": "margaret@example.com",
        "role": "member",
    }
    assert again.status_code == 409
    assert (unknown.status_code, list(unknown.json()["errors"])) == (422, ["user_id"])
    assert (bad_role.status_code, list(bad_role.json()["errors"])) == (422, ["role"])


def test_members_cannot_add_members(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Only owners invite people: a member gets 403 and a stranger 404."""
    body = {"user_id": MARGARET}

    member = client.post("/v1/projects/1/members", json=body, headers=auth_headers(people[GRACE]))
    stranger = client.post("/v1/projects/1/members", json=body, headers=auth_headers(people[LINUS]))

    assert (member.status_code, stranger.status_code) == (403, 404)


def test_stats_count_every_status(
    client: TestClient, db: Session, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Each status appears, with 0 when no task has it. Strangers get 404."""
    empty = make_project(db, people[MARGARET])

    assert client.get("/v1/projects/1/stats", headers=auth_headers(people[ADA])).json() == {
        "todo": 3,
        "doing": 3,
        "done": 2,
    }
    assert client.get(
        f"/v1/projects/{empty.id}/stats", headers=auth_headers(people[MARGARET])
    ).json() == {
        "todo": 0,
        "doing": 0,
        "done": 0,
    }
    assert (
        client.get("/v1/projects/3/stats", headers=auth_headers(people[MARGARET])).status_code
        == 404
    )


def test_archived_projects_take_no_new_tasks(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """Owners archive with PATCH. A new task in an archived project is a 409 project_archived."""
    owner = make_user(db)
    project = make_project(db, owner)
    headers = auth_headers(owner)

    archived = client.patch(f"/v1/projects/{project.id}", json={"archived": True}, headers=headers)
    response = client.post(
        f"/v1/projects/{project.id}/tasks", json={"title": "One more"}, headers=headers
    )

    assert archived.json()["archived"] is True
    assert response.status_code == 409
    assert response.json()["type"].endswith("/project_archived")


def test_the_board_groups_cards_by_status(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A column per status, cards in position order, each with assignee, tags, and comment count."""
    owner = make_user(db, name="Ada")
    project = make_project(db, owner)
    first = make_task(db, project, title="First", assignee_id=owner.id)
    make_task(db, project, title="Second")
    make_task(db, project, title="Done one", status=TaskStatus.DONE)
    make_tag(db, "bug", first)
    make_comment(db, first, owner)

    response = client.get(f"/v1/projects/{project.id}/board", headers=auth_headers(owner))

    columns = {column["status"]: column["tasks"] for column in response.json()["columns"]}
    assert [card["title"] for card in columns["todo"]] == ["First", "Second"]
    assert columns["doing"] == []
    assert [card["title"] for card in columns["done"]] == ["Done one"]
    card = columns["todo"][0]
    assert (card["assignee"], card["tags"], card["comment_count"]) == (
        {"id": owner.id, "name": "Ada"},
        ["bug"],
        1,
    )


def test_the_board_runs_the_same_statements_for_5_or_60_tasks(
    client: TestClient, db: Session, auth_headers: AuthHeaders, count_queries
) -> None:
    """Assignees, tags, and comment counts load in a fixed number of statements (no N+1)."""
    owner = make_user(db)
    small, big = make_project(db, owner), make_project(db, owner)
    tag = make_tag(db, "docs")
    for project, size in ((small, 5), (big, 60)):
        for _ in range(size):
            # A different assignee per card, so a lazy load per card cannot hide behind one
            # user the session already holds.
            task = make_task(db, project, assignee_id=make_user(db).id)
            task.tags.append(tag)
            make_comment(db, task, owner)
    db.flush()

    with count_queries() as for_small:
        client.get(f"/v1/projects/{small.id}/board", headers=auth_headers(owner))
    with count_queries() as for_big:
        client.get(f"/v1/projects/{big.id}/board", headers=auth_headers(owner))

    assert len(for_small) == len(for_big)


def test_viewers_read_but_never_write(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A viewer reads tasks like a member, and gets 403 for creating one."""
    owner, viewer = make_user(db), make_user(db)
    project = make_project(db, owner, viewers=(viewer,))
    headers = auth_headers(viewer)

    read = client.get(f"/v1/projects/{project.id}/tasks", headers=headers)
    write = client.post(
        f"/v1/projects/{project.id}/tasks", json={"title": "Sneaky"}, headers=headers
    )

    assert (read.status_code, write.status_code) == (200, 403)


def test_admins_are_users_too(db: Session) -> None:
    """The admin role is an account role. Project roles live on memberships."""
    admin = make_user(db, role=UserRole.ADMIN)

    assert admin.is_admin
    assert not make_user(db).is_admin
