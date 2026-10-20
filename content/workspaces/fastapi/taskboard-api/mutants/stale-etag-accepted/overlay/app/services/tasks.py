"""Task rules: what a valid task is, how status changes, and what each change sets off.

Routes check who may act (`require_task_role` in `app/api/deps.py`). This module checks
whether the change itself is allowed, then commits it as one transaction:

- The assignee must be a member of the project (422).
- A due date may not be before today or before the project's start (422).
- A task cannot be added to an archived project (409 `project_archived`).
- A done task cannot be reassigned (409 `task_locked`).
- Status changes follow `TaskStatus.can_transition_to`, set `completed_at` on done, and
  clear it when a task is reopened.
- `PATCH` needs the task's current ETag in `If-Match` (428 without it, 412 when stale).
"""

from datetime import date

from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.core.clock import Clock
from app.core.errors import (
    Locked,
    NotFound,
    PreconditionFailed,
    PreconditionRequired,
    Unprocessable,
)
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.repositories import projects, tasks, users, watchers
from app.schemas.common import Page
from app.schemas.task import MoveIn, TaskCreate, TaskFilters, TaskOut, TaskUpdate
from app.services import notifications
from app.services.projects import ProjectArchived


class TaskLocked(Locked):
    code = "task_locked"
    title = "Task locked"


class DueBeforeProjectStart(Unprocessable):
    code = "due_before_project_start"
    title = "Due before the project starts"


class StaleTask(PreconditionFailed):
    """The client's copy is out of date. The problem carries the task as it is now."""

    def __init__(self, task: Task) -> None:
        super().__init__(
            f"task {task.id} has changed since you read it, and is now at version {task.version}",
            extra={"current": TaskOut.model_validate(task).model_dump(mode="json")},
        )


def load(session: Session, task_id: int) -> Task:
    task = tasks.get(session, task_id)
    if task is None:
        raise NotFound(f"task {task_id} not found")
    return task


def detail(session: Session, task: Task) -> Task:
    """The task with its tags loaded, for `TaskDetail`."""
    loaded = tasks.get_with_tags(session, task.id)
    assert loaded is not None
    return loaded


def list_tasks(
    session: Session, project: Project, filters: TaskFilters, *, limit: int, offset: int
) -> Page[TaskOut]:
    page = tasks.list_tasks(session, project.id, filters, limit=limit, offset=offset)
    items = [TaskOut.model_validate(task) for task in page.items]
    return Page(items=items, total=page.total, limit=limit, offset=offset)


def list_assigned(session: Session, user: User, *, limit: int, offset: int) -> Page[TaskOut]:
    page = tasks.list_for_assignee(session, user.id, limit=limit, offset=offset)
    items = [TaskOut.model_validate(task) for task in page.items]
    return Page(items=items, total=page.total, limit=limit, offset=offset)


# ---------------------------------------------------------------- rules


def _check_assignee(session: Session, project: Project, assignee_id: int) -> User:
    assignee = users.get(session, assignee_id)
    if assignee is None or projects.role_of(session, project.id, assignee_id) is None:
        raise Unprocessable(
            f"user {assignee_id} is not a member of this project",
            errors={"assignee_id": "must be a member of the project"},
        )
    return assignee


def _check_due_on(project: Project, due_on: date, *, today: date) -> None:
    if due_on < today:
        raise Unprocessable(
            f"{due_on} is in the past (today is {today})",
            errors={"due_on": f"must be {today} or later"},
        )
    if project.start_date is not None and due_on < project.start_date:
        raise DueBeforeProjectStart(
            f"the project starts on {project.start_date}, after {due_on}",
            errors={"due_on": f"must be on or after the project's start, {project.start_date}"},
        )


def _set_status(task: Task, status: TaskStatus, *, clock: Clock) -> None:
    """Records when a task was finished, and forgets it when the task is reopened."""
    if status is TaskStatus.DONE:
        task.completed_at = clock.now()
    elif task.completed_at is not None:
        task.completed_at = None


def allowed_targets(status: TaskStatus) -> list[str]:
    return [target.value for target in TaskStatus if status.can_transition_to(target)]


def _matches(if_match: str, task: Task) -> bool:
    tags = {tag.strip().removeprefix("W/") for tag in if_match.split(",")}
    return "*" in tags or task.etag in tags


# ---------------------------------------------------------------- changes


def create_task(session: Session, project: Project, data: TaskCreate, *, clock: Clock) -> Task:
    if project.archived:
        raise ProjectArchived(f"project {project.id} is archived, so it takes no new tasks")
    assignee = _check_assignee(session, project, data.assignee_id) if data.assignee_id else None
    if data.due_on is not None:
        _check_due_on(project, data.due_on, today=clock.today())

    task = Task(
        project_id=project.id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        due_on=data.due_on,
        assignee_id=data.assignee_id,
        status=TaskStatus.TODO,
        position=tasks.next_position(session, project.id, TaskStatus.TODO),
    )
    tasks.add(session, task)
    if assignee is not None:
        notifications.task_assigned(session, task, assignee)
    session.commit()
    return task


def update_task(
    session: Session, task: Task, data: TaskUpdate, *, if_match: str | None, clock: Clock
) -> Task:
    if if_match is None:
        raise PreconditionRequired('send If-Match with the task\'s ETag, such as If-Match: "v1"')

    changes = data.model_dump(exclude_unset=True)
    assignee = None
    if (assignee_id := changes.get("assignee_id")) is not None and assignee_id != task.assignee_id:
        if task.status is TaskStatus.DONE:
            raise TaskLocked(f"task {task.id} is done, so it cannot be reassigned")
        assignee = _check_assignee(session, task.project, assignee_id)
    if (due_on := changes.get("due_on")) is not None and due_on != task.due_on:
        _check_due_on(task.project, due_on, today=clock.today())

    for field, value in changes.items():
        setattr(task, field, value)
    if assignee is not None:
        notifications.task_assigned(session, task, assignee)
    try:
        session.commit()
    except StaleDataError:
        # Another request changed the task between our read and this write.
        session.rollback()
        raise StaleTask(load(session, task.id)) from None
    return task


def transition_task(
    session: Session, task: Task, to: TaskStatus, *, actor: User, clock: Clock
) -> Task:
    old = task.status
    if not old.can_transition_to(to):
        raise Unprocessable(
            f"a {old} task cannot move to {to}",
            errors={"to": f"must be one of {', '.join(allowed_targets(old))} for a {old} task"},
        )
    tasks.move(session, task, to)
    _set_status(task, to, clock=clock)
    notifications.status_changed(
        session, task, old, to, actor=actor, watchers=watchers.list_for_task(session, task.id)
    )
    session.commit()
    return task


def move_task(session: Session, task: Task, data: MoveIn, *, actor: User, clock: Clock) -> Task:
    """Drags a card: to another position in its column, or into another column, where the
    transition rules apply."""
    old = task.status
    status = data.status or old
    if status is not old and not old.can_transition_to(status):
        raise Unprocessable(
            f"a {old} task cannot move to {status}",
            errors={"status": f"must be one of {', '.join(allowed_targets(old))} for a {old} task"},
        )
    tasks.move(session, task, status, data.position)
    if status is not old:
        _set_status(task, status, clock=clock)
        notifications.status_changed(
            session,
            task,
            old,
            status,
            actor=actor,
            watchers=watchers.list_for_task(session, task.id),
        )
    session.commit()
    return task


def delete_task(session: Session, task: Task) -> None:
    """Deletes the task, its comments, and its watchers, and closes the gap in its column."""
    project_id = task.project_id
    tasks.lock_columns(session, project_id, TaskStatus)  # the whole board, as a move does
    status, position = task.status, task.position  # as they are under the lock
    tasks.delete(session, task)
    tasks.shift_positions(session, project_id, status, start=position + 1, by=-1)
    session.commit()
