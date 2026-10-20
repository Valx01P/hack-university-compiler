"""Tasks: the filtered and sorted list, creating, editing with ETags, transitions, moves on
the board, deleting, and the tasks assigned to me."""

from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutboxMessage, Project, Task, TaskStatus, User
from app.worker import process_outbox
from tests.conftest import CLOCK, AuthHeaders
from tests.factories import make_comment, make_project, make_task, make_user

ADA, GRACE, LINUS, MARGARET = 1, 2, 3, 4


@pytest.fixture
def people(db: Session, seeded: dict[str, Any]) -> dict[int, User]:
    return {user_id: db.get(User, user_id) for user_id in (ADA, GRACE, LINUS, MARGARET)}


@pytest.fixture
def team(db: Session) -> tuple[User, User, Project]:
    """An owner, a member, and their project, which starts on 2026-09-01."""
    owner, member = make_user(db), make_user(db)
    return owner, member, make_project(db, owner, members=(member,))


def ids(response) -> list[int]:
    return [task["id"] for task in response.json()["items"]]


# ---------------------------------------------------------------- the list


def test_list_defaults_to_oldest_first_with_the_page_envelope(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """`{items, total, limit, offset}`, 20 per page, in created order."""
    response = client.get("/v1/projects/1/tasks", headers=auth_headers(people[ADA]))

    body = response.json()
    assert ids(response) == [1, 2, 3, 4, 5, 6, 7, 8]
    assert (body["total"], body["limit"], body["offset"]) == (8, 20, 0)
    assert body["items"][2] == {
        "id": 3,
        "project_id": 1,
        "title": "Design the pricing page",
        "description": "Three plans, a comparison table, and the FAQ.",
        "status": "doing",
        "priority": 3,
        "due_on": "2026-10-01",
        "assignee_id": 2,
        "version": 1,
        "completed_at": None,
        "created_at": "2026-09-10T11:00:00Z",
        "updated_at": "2026-09-10T11:00:00Z",
        "position": 1,
    }


@pytest.mark.parametrize(
    ("query", "expected", "total"),
    [
        ("status=todo", [2, 5, 7], 3),
        ("assignee_id=2", [1, 3, 5, 8], 4),
        ("q=LOGIN", [1], 1),
        ("status=done&assignee_id=1", [6], 1),
        ("status=todo&sort=due&limit=2", [2, 5], 3),
        ("limit=3&offset=3", [4, 5, 6], 8),
    ],
    ids=[
        "status",
        "assignee",
        "search",
        "status-and-assignee",
        "filters-sort-limit",
        "middle-page",
    ],
)
def test_filters_combine_and_total_counts_every_match(
    client: TestClient,
    people: dict[int, User],
    auth_headers: AuthHeaders,
    query: str,
    expected: list[int],
    total: int,
) -> None:
    """Filters combine with AND, and `total` counts every match, not just the page."""
    response = client.get(f"/v1/projects/1/tasks?{query}", headers=auth_headers(people[ADA]))

    assert ids(response) == expected
    assert response.json()["total"] == total


def test_unassigned_and_search_in_other_projects(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """`assignee_id=none` finds unassigned tasks, and a `%` in `q` is a literal percent sign."""
    unassigned = client.get(
        "/v1/projects/2/tasks?assignee_id=none", headers=auth_headers(people[GRACE])
    )
    percent = client.get("/v1/projects/3/tasks?q=0%25", headers=auth_headers(people[LINUS]))

    assert ids(unassigned) == [10, 15]
    assert ids(percent) == [17]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("sort=due", [6, 2, 5, 3, 7, 8, 1, 4]),
        ("sort=due&order=desc", [4, 1, 8, 7, 3, 5, 2, 6]),
        ("sort=priority&order=desc", [1, 3, 2, 5, 7, 4, 6, 8]),
        ("sort=title", [8, 5, 3, 1, 4, 6, 7, 2]),
    ],
    ids=["due", "due-desc", "priority-desc", "title"],
)
def test_sorting_breaks_ties_by_id(
    client: TestClient,
    people: dict[int, User],
    auth_headers: AuthHeaders,
    query: str,
    expected: list[int],
) -> None:
    """Sorts by due date, priority, or title (ignoring case), with ties in id order."""
    assert (
        ids(client.get(f"/v1/projects/1/tasks?{query}", headers=auth_headers(people[ADA])))
        == expected
    )


def test_tasks_without_a_due_date_sort_last_either_way(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """No due date comes after every date, ascending or descending."""
    owner, _, project = team
    undated = make_task(db, project)
    early = make_task(db, project, due_on=date(2026, 10, 2))
    late = make_task(db, project, due_on=date(2026, 10, 9))
    url = f"/v1/projects/{project.id}/tasks?sort=due"

    assert ids(client.get(url, headers=auth_headers(owner))) == [early.id, late.id, undated.id]
    assert ids(client.get(f"{url}&order=desc", headers=auth_headers(owner))) == [
        late.id,
        early.id,
        undated.id,
    ]


@pytest.mark.parametrize(
    ("query", "field"),
    [
        ("q=a", "q"),
        ("status=blocked", "status"),
        ("limit=0", "limit"),
        ("limit=101", "limit"),
        ("offset=-1", "offset"),
        ("sort=password", "sort"),
        ("order=up", "order"),
        ("assignee_id=grace", "assignee_id"),
    ],
    ids=[
        "short-q",
        "unknown-status",
        "zero-limit",
        "big-limit",
        "negative-offset",
        "bad-sort",
        "bad-order",
        "bad-assignee",
    ],
)
def test_bad_query_parameters_are_400_problems(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders, query: str, field: str
) -> None:
    """A bad query parameter is a 400 problem whose `errors` names it."""
    response = client.get(f"/v1/projects/1/tasks?{query}", headers=auth_headers(people[ADA]))

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    assert field in response.json()["errors"]


def test_the_list_runs_the_same_statements_for_2_or_20_tasks(
    client: TestClient,
    db: Session,
    team: tuple[User, User, Project],
    auth_headers: AuthHeaders,
    count_queries,
) -> None:
    """No statement per row: listing 20 tasks costs what listing 2 does."""
    owner, _, small = team
    big = make_project(db, owner)
    for project, size in ((small, 2), (big, 20)):
        for _ in range(size):
            make_task(db, project, assignee_id=owner.id)

    with count_queries() as for_small:
        client.get(f"/v1/projects/{small.id}/tasks", headers=auth_headers(owner))
    with count_queries() as for_big:
        client.get(f"/v1/projects/{big.id}/tasks", headers=auth_headers(owner))

    assert len(for_small) == len(for_big)


# ---------------------------------------------------------------- creating


def test_create_trims_the_title_and_starts_a_task_at_version_1(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """A new task is todo, version 1, stamped with the clock, with Location and ETag headers."""
    owner, member, project = team
    body = {
        "title": "  Write the launch email  ",
        "priority": 3,
        "due_on": "2026-10-12",
        "assignee_id": owner.id,
    }

    response = client.post(
        f"/v1/projects/{project.id}/tasks", json=body, headers=auth_headers(member)
    )

    assert response.status_code == 201
    task = response.json()
    assert response.headers["location"] == f"/v1/tasks/{task['id']}"
    assert response.headers["etag"] == '"v1"'
    assert (task["title"], task["status"], task["version"], task["position"]) == (
        "Write the launch email",
        "todo",
        1,
        0,
    )
    assert task["created_at"] == task["updated_at"] == "2026-10-01T09:00:00Z"


def test_create_fills_the_defaults(
    client: TestClient, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Priority 2, no due date, nobody assigned, no description."""
    owner, _, project = team

    task = client.post(
        f"/v1/projects/{project.id}/tasks", json={"title": "Tidy"}, headers=auth_headers(owner)
    ).json()

    assert (task["priority"], task["due_on"], task["assignee_id"], task["description"]) == (
        2,
        None,
        None,
        None,
    )


@pytest.mark.parametrize(
    ("body", "status", "field"),
    [
        ({"title": "x" * 121}, 422, "title"),
        ({"title": "   "}, 422, "title"),
        ({"title": "Ship it", "priority": 4}, 422, "priority"),
        ({"title": "Ship it", "due_on": "2026-13-01"}, 422, "due_on"),
        ({"title": "Ship it", "due_on": "2026-09-30"}, 422, "due_on"),
        ({}, 422, "title"),
        ({"title": "Ship it", "priority": "high"}, 400, "priority"),
        ({"title": "Ship it", "priority": "3"}, 400, "priority"),
        ({"title": "Ship it", "status": "done"}, 400, "status"),
        ({"title": 7}, 400, "title"),
    ],
    ids=[
        "long-title",
        "blank-title",
        "priority-4",
        "impossible-date",
        "past-date",
        "no-title",
        "priority-word",
        "priority-string",
        "status-field",
        "number-title",
    ],
)
def test_create_validates_the_body(
    client: TestClient,
    team: tuple[User, User, Project],
    auth_headers: AuthHeaders,
    body: dict[str, Any],
    status: int,
    field: str,
) -> None:
    """Rule breaks are 422s, and malformed bodies (unknown field, wrong JSON type) are 400s."""
    owner, _, project = team

    response = client.post(
        f"/v1/projects/{project.id}/tasks", json=body, headers=auth_headers(owner)
    )

    assert response.status_code == status
    assert field in response.json()["errors"]


def test_a_title_of_exactly_120_characters_is_fine(
    client: TestClient, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """120 characters is the limit, inclusive."""
    owner, _, project = team

    response = client.post(
        f"/v1/projects/{project.id}/tasks", json={"title": "x" * 120}, headers=auth_headers(owner)
    )

    assert response.status_code == 201


def test_the_assignee_must_be_a_member(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Assigning someone outside the project is a 422 naming assignee_id."""
    owner, _, project = team
    outsider = make_user(db)

    response = client.post(
        f"/v1/projects/{project.id}/tasks",
        json={"title": "Ship it", "assignee_id": outsider.id},
        headers=auth_headers(owner),
    )

    assert response.status_code == 422
    assert response.json()["errors"] == {"assignee_id": "must be a member of the project"}


def test_a_due_date_before_the_project_starts_is_refused(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A project starting 2026-11-01 takes no task due 2026-10-15: 422 due_before_project_start."""
    owner = make_user(db)
    project = make_project(db, owner, start_date=date(2026, 11, 1))

    response = client.post(
        f"/v1/projects/{project.id}/tasks",
        json={"title": "Too early", "due_on": "2026-10-15"},
        headers=auth_headers(owner),
    )

    assert response.status_code == 422
    assert response.json()["type"].endswith("/due_before_project_start")
    assert "due_on" in response.json()["errors"]


def test_who_may_create_tasks(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Members create (201). A stranger gets 404, and an admin outside the project 403."""
    body = {"title": "Ship it"}

    member = client.post("/v1/projects/1/tasks", json=body, headers=auth_headers(people[GRACE]))
    stranger = client.post(
        "/v1/projects/1/tasks", json=body, headers=auth_headers(people[MARGARET])
    )
    admin = client.post("/v1/projects/3/tasks", json=body, headers=auth_headers(people[ADA]))

    assert (member.status_code, stranger.status_code, admin.status_code) == (201, 404, 403)


# ---------------------------------------------------------------- reading and editing


def test_get_returns_the_task_with_its_etag_and_tags(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """GET carries ETag "v<version>", and the detail lists the task's tag names."""
    response = client.get("/v1/tasks/1", headers=auth_headers(people[GRACE]))

    assert response.headers["etag"] == '"v1"'
    assert response.json()["tags"] == ["backend", "bug", "urgent"]


def test_get_hides_tasks_outside_your_projects(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A task in a project you are not in is 404, like one that does not exist."""
    assert client.get("/v1/tasks/9", headers=auth_headers(people[MARGARET])).status_code == 404
    assert client.get("/v1/tasks/999", headers=auth_headers(people[GRACE])).status_code == 404
    assert client.get("/v1/tasks/abc", headers=auth_headers(people[GRACE])).status_code == 400


def test_ids_beyond_the_integer_range_are_400s(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Ids from 1 to 2147483647 reach the database. 0 and bigger ids are 400s, never 500s."""
    headers = auth_headers(people[GRACE])

    for task_id in (0, 2_147_483_648, 10**20):
        response = client.get(f"/v1/tasks/{task_id}", headers=headers)
        assert (response.status_code, list(response.json()["errors"])) == (400, ["task_id"])
    big_assignee = {"title": "Ship it", "assignee_id": 10**12}
    response = client.post("/v1/projects/1/tasks", json=big_assignee, headers=headers)
    assert (response.status_code, list(response.json()["errors"])) == (422, ["assignee_id"])


def test_patch_with_the_current_etag_bumps_the_version(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """If-Match with the current ETag: 200, version + 1, and a new ETag."""
    owner, _, project = team
    task = make_task(db, project, priority=3)

    response = client.patch(
        f"/v1/tasks/{task.id}",
        json={"title": "Renamed"},
        headers=auth_headers(owner) | {"If-Match": '"v1"'},
    )

    assert response.status_code == 200
    assert response.headers["etag"] == '"v2"'
    assert (response.json()["title"], response.json()["version"], response.json()["priority"]) == (
        "Renamed",
        2,
        3,
    )


def test_patch_with_a_stale_etag_returns_the_current_task(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """A stale If-Match is 412, and the problem's `current` holds the task as it is now."""
    owner, _, project = team
    task = make_task(db, project, title="Now")
    headers = auth_headers(owner)
    client.patch(
        f"/v1/tasks/{task.id}", json={"priority": 1}, headers=headers | {"If-Match": '"v1"'}
    )

    response = client.patch(
        f"/v1/tasks/{task.id}", json={"priority": 3}, headers=headers | {"If-Match": '"v1"'}
    )

    assert response.status_code == 412
    assert response.json()["current"]["version"] == 2
    assert response.json()["current"]["priority"] == 1


def test_patch_without_if_match_is_428(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Without If-Match the server cannot know what you saw, so it refuses with 428."""
    owner, _, project = team
    task = make_task(db, project)

    response = client.patch(
        f"/v1/tasks/{task.id}", json={"priority": 1}, headers=auth_headers(owner)
    )

    assert response.status_code == 428


def test_patch_null_clears_and_status_is_not_a_field(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """`null` clears due_on and assignee_id. `status` changes only through transition (400)."""
    owner, member, project = team
    task = make_task(db, project, due_on=date(2026, 10, 9), assignee_id=member.id)
    headers = auth_headers(owner) | {"If-Match": '"v1"'}

    status = client.patch(f"/v1/tasks/{task.id}", json={"status": "done"}, headers=headers)
    cleared = client.patch(
        f"/v1/tasks/{task.id}", json={"due_on": None, "assignee_id": None}, headers=headers
    )

    assert status.status_code == 400
    assert (cleared.json()["due_on"], cleared.json()["assignee_id"]) == (None, None)


def test_a_done_task_cannot_be_reassigned(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Reassigning a done task is a 409 problem of type task_locked."""
    owner, member, project = team
    task = make_task(db, project, status=TaskStatus.DONE, assignee_id=owner.id)

    response = client.patch(
        f"/v1/tasks/{task.id}",
        json={"assignee_id": member.id},
        headers=auth_headers(owner) | {"If-Match": '"v1"'},
    )

    assert response.status_code == 409
    assert response.json()["type"].endswith("/task_locked")


def test_admins_outside_a_project_cannot_edit(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """Ada reads Data Pipeline's tasks but gets 403 for editing one."""
    response = client.patch(
        "/v1/tasks/16",
        json={"priority": 1},
        headers=auth_headers(people[ADA]) | {"If-Match": '"v1"'},
    )

    assert response.status_code == 403


# ---------------------------------------------------------------- transitions and moves


def transition(client: TestClient, task_id: int, to: str, headers: dict[str, str]):
    return client.post(f"/v1/tasks/{task_id}/transition", json={"to": to}, headers=headers)


def test_transitions_follow_the_rules(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """todo -> doing -> done -> doing works, done -> todo and same-status moves are 422s."""
    owner, _, project = team
    task = make_task(db, project)
    headers = auth_headers(owner)

    doing = transition(client, task.id, "doing", headers)
    done = transition(client, task.id, "done", headers)
    back_to_todo = transition(client, task.id, "todo", headers)
    reopened = transition(client, task.id, "doing", headers)
    same = transition(client, task.id, "doing", headers)
    unknown = transition(client, task.id, "blocked", headers)

    assert (doing.json()["status"], doing.json()["version"], doing.headers["etag"]) == (
        "doing",
        2,
        '"v2"',
    )
    assert (done.json()["completed_at"], done.json()["version"]) == ("2026-10-01T09:00:00Z", 3)
    assert (back_to_todo.status_code, list(back_to_todo.json()["errors"])) == (422, ["to"])
    assert (reopened.json()["completed_at"], reopened.json()["version"]) == (None, 4)
    assert (same.status_code, unknown.status_code) == (422, 422)


def test_todo_can_go_straight_to_done(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """A card dragged from To do to Done is finished at once."""
    owner, _, project = team
    task = make_task(db, project)

    response = transition(client, task.id, "done", auth_headers(owner))

    assert (response.json()["status"], response.json()["completed_at"]) == (
        "done",
        "2026-10-01T09:00:00Z",
    )


def column(db: Session, project: Project, status: TaskStatus) -> list[tuple[int, int]]:
    rows = db.execute(
        select(Task.id, Task.position)
        .where(Task.project_id == project.id, Task.status == status)
        .order_by(Task.position)
    )
    return [(task_id, position) for task_id, position in rows]


def test_a_transition_moves_the_card_to_the_end_of_its_new_column(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Both columns stay numbered 0, 1, 2, ... with no gap where the card left."""
    owner, _, project = team
    a, b, c = (make_task(db, project) for _ in range(3))
    started = make_task(db, project, status=TaskStatus.DOING)

    transition(client, a.id, "doing", auth_headers(owner))

    assert column(db, project, TaskStatus.TODO) == [(b.id, 0), (c.id, 1)]
    assert column(db, project, TaskStatus.DOING) == [(started.id, 0), (a.id, 1)]


def test_moves_keep_every_column_contiguous(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """After moves within and across columns, positions in every column are 0..n-1."""
    owner, _, project = team
    todo = [make_task(db, project) for _ in range(4)]
    headers = auth_headers(owner)

    client.post(f"/v1/tasks/{todo[3].id}/move", json={"position": 0}, headers=headers)
    client.post(
        f"/v1/tasks/{todo[1].id}/move", json={"status": "doing", "position": 0}, headers=headers
    )
    client.post(
        f"/v1/tasks/{todo[0].id}/move", json={"status": "doing", "position": 0}, headers=headers
    )
    client.post(f"/v1/tasks/{todo[3].id}/move", json={"position": 99}, headers=headers)

    assert column(db, project, TaskStatus.TODO) == [(todo[2].id, 0), (todo[3].id, 1)]
    assert column(db, project, TaskStatus.DOING) == [(todo[0].id, 0), (todo[1].id, 1)]


def test_a_move_across_columns_follows_the_transition_rules(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """A done card cannot be dropped into To do: 422 naming status."""
    owner, _, project = team
    task = make_task(db, project, status=TaskStatus.DONE)

    response = client.post(
        f"/v1/tasks/{task.id}/move",
        json={"status": "todo", "position": 0},
        headers=auth_headers(owner),
    )

    assert (response.status_code, list(response.json()["errors"])) == (422, ["status"])


def test_sliding_neighbours_keep_their_versions(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """Only the moved task gets a new version. The cards that slide along keep their ETags."""
    owner, _, project = team
    first, second = make_task(db, project), make_task(db, project)

    moved = client.post(
        f"/v1/tasks/{second.id}/move", json={"position": 0}, headers=auth_headers(owner)
    )

    assert moved.json()["version"] == 2
    assert (
        client.get(f"/v1/tasks/{first.id}", headers=auth_headers(owner)).headers["etag"] == '"v1"'
    )


def test_watchers_hear_about_status_changes_through_the_outbox(
    client: TestClient,
    db: Session,
    team: tuple[User, User, Project],
    auth_headers: AuthHeaders,
    mail_log,
) -> None:
    """A transition queues a message per watcher but the actor, and the worker sends it once."""
    owner, member, project = team
    task = make_task(db, project, title="Ship v2")
    for user in (owner, member):
        client.put(f"/v1/tasks/{task.id}/watchers/{user.id}", headers=auth_headers(owner))

    transition(client, task.id, "doing", auth_headers(owner))
    queued = db.scalars(select(OutboxMessage)).all()
    first_run = process_outbox(db, clock=CLOCK)
    second_run = process_outbox(db, clock=CLOCK)

    assert [message.payload["to"] for message in queued] == [member.email]
    assert (first_run, second_run) == (1, 0)
    assert mail_log.read_text() == (
        f"2026-10-01T09:00:00Z to={member.email} "
        f'subject="Task {task.id} moved from todo to doing: Ship v2"\n'
    )


# ---------------------------------------------------------------- deleting


def test_only_owners_delete_tasks(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """A member and an admin who is not the owner get 403, a stranger 404, and the owner 204."""
    member = client.delete("/v1/tasks/2", headers=auth_headers(people[GRACE]))
    admin = client.delete("/v1/tasks/9", headers=auth_headers(people[ADA]))
    stranger = client.delete("/v1/tasks/1", headers=auth_headers(people[MARGARET]))
    owner = client.delete("/v1/tasks/2", headers=auth_headers(people[ADA]))

    assert (member.status_code, admin.status_code, stranger.status_code) == (403, 403, 404)
    assert (owner.status_code, owner.content) == (204, b"")
    assert client.get("/v1/tasks/2", headers=auth_headers(people[ADA])).status_code == 404


def test_deleting_takes_comments_and_closes_the_gap(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """The task's comments go with it, and the cards after it move up one place."""
    owner, _, project = team
    first, second, third = (make_task(db, project) for _ in range(3))
    make_comment(db, first, owner)

    client.delete(f"/v1/tasks/{first.id}", headers=auth_headers(owner))

    assert column(db, project, TaskStatus.TODO) == [(second.id, 0), (third.id, 1)]
    assert (
        client.get(f"/v1/tasks/{first.id}/comments", headers=auth_headers(owner)).status_code == 404
    )


# ---------------------------------------------------------------- my tasks and mail


def test_my_tasks_are_mine_only_soonest_due_first(
    client: TestClient, people: dict[int, User], auth_headers: AuthHeaders
) -> None:
    """GET /v1/me/tasks pages the caller's tasks across projects, by due date, then id."""
    response = client.get("/v1/me/tasks", headers=auth_headers(people[GRACE]))

    body = response.json()
    assert [task["id"] for task in body["items"]] == [5, 3, 12, 8, 1, 14]
    assert {task["assignee_id"] for task in body["items"]} == {GRACE}
    assert body["total"] == 6
    assert client.get("/v1/me/tasks").status_code == 401


def test_assigning_a_task_mails_the_assignee_after_commit(
    client: TestClient,
    db: Session,
    team: tuple[User, User, Project],
    auth_headers: AuthHeaders,
    mail_log,
) -> None:
    """One line in the mail log once the assignment is committed."""
    owner, member, project = team

    response = client.post(
        f"/v1/projects/{project.id}/tasks",
        json={"title": "Write docs", "assignee_id": member.id},
        headers=auth_headers(owner),
    )

    task_id = response.json()["id"]
    assert mail_log.read_text() == (
        f"2026-10-01T09:00:00Z to={member.email} "
        f'subject="You were assigned task {task_id}: Write docs"\n'
    )


def test_a_rolled_back_assignment_mails_nobody(
    db: Session, team: tuple[User, User, Project], mail_log
) -> None:
    """The mail waits for the commit, so a rollback drops it."""
    from app.services import notifications

    _, member, project = team
    task = make_task(db, project, assignee_id=member.id)
    notifications.task_assigned(db, task, member)
    db.rollback()

    assert not mail_log.exists()


def test_the_internal_endpoint_needs_the_internal_key(
    client: TestClient, db: Session, team: tuple[User, User, Project], auth_headers: AuthHeaders
) -> None:
    """POST /internal/outbox/run sends the outbox with the right X-Internal-Key, else 403."""
    from app.core.config import get_settings

    owner, member, project = team
    task = make_task(db, project)
    client.put(f"/v1/tasks/{task.id}/watchers/{member.id}", headers=auth_headers(owner))
    transition(client, task.id, "doing", auth_headers(owner))
    key = get_settings().internal_api_key.get_secret_value()

    without = client.post("/internal/outbox/run")
    wrong = client.post("/internal/outbox/run", headers={"X-Internal-Key": "guess"})
    right = client.post("/internal/outbox/run", headers={"X-Internal-Key": key})

    assert (without.status_code, wrong.status_code) == (403, 403)
    assert right.json() == {"sent": 1}
