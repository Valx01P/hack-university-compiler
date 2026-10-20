"""Queries about tasks: the filtered list, counts, the board, and positions in a column."""

from collections.abc import Iterable
from typing import NamedTuple

from sqlalchemy import ColumnElement, Select, func, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.comment import Comment
from app.models.task import Task, TaskStatus
from app.repositories import escape_like
from app.schemas.task import TaskFilters

SORT_COLUMNS = {
    "created": Task.created_at,
    "due": Task.due_on,
    "priority": Task.priority,
    "title": func.lower(Task.title),
}


class TaskPage(NamedTuple):
    items: list[Task]
    total: int


def _apply_filters(statement: Select[tuple[Task]], filters: TaskFilters) -> Select[tuple[Task]]:
    if filters.status is not None:
        statement = statement.where(Task.status == filters.status)
    if filters.assignee_id == "none":
        statement = statement.where(Task.assignee_id.is_(None))
    elif filters.assignee_id is not None:
        statement = statement.where(Task.assignee_id == filters.assignee_id)
    if filters.q is not None:
        pattern = f"%{escape_like(filters.q)}%"
        statement = statement.where(
            Task.title.ilike(pattern, escape="\\") | Task.description.ilike(pattern, escape="\\")
        )
    return statement


def _ordering(sort: str, order: str) -> list[ColumnElement[object]]:
    """The sort column in the chosen direction, then id, so equal keys keep a stable order."""
    column = SORT_COLUMNS[sort]
    key = column.desc() if order == "desc" else column.asc()
    if sort == "due":
        key = key.nulls_last()  # tasks without a due date come last either way
    return [key, Task.id.asc()]


def list_tasks(
    session: Session, project_id: int, filters: TaskFilters, *, limit: int, offset: int
) -> TaskPage:
    """One page of a project's tasks, and how many tasks match the filters in all."""
    statement = _apply_filters(select(Task).where(Task.project_id == project_id), filters)
    total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    page = statement.order_by(*_ordering(filters.sort, filters.order)).limit(limit).offset(offset)
    return TaskPage(list(session.scalars(page)), total)


def list_for_assignee(session: Session, user_id: int, *, limit: int, offset: int) -> TaskPage:
    """The tasks assigned to `user_id`, soonest due first (no due date last), then by id."""
    statement = select(Task).where(Task.assignee_id == user_id)
    total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    page = statement.order_by(Task.due_on.asc().nulls_last(), Task.id).limit(limit).offset(offset)
    return TaskPage(list(session.scalars(page)), total)


def count_by_status(session: Session, project_id: int) -> dict[TaskStatus, int]:
    """`{todo: 3, doing: 3, done: 2}`, with 0 for a status no task has."""
    statement = (
        select(Task.status, func.count()).where(Task.project_id == project_id).group_by(Task.status)
    )
    found = dict(session.execute(statement).all())
    return {status: found.get(status, 0) for status in TaskStatus}


def get(session: Session, task_id: int) -> Task | None:
    return session.get(Task, task_id)


def get_with_tags(session: Session, task_id: int) -> Task | None:
    return session.scalar(select(Task).where(Task.id == task_id).options(selectinload(Task.tags)))


def add(session: Session, task: Task) -> Task:
    session.add(task)
    session.flush()
    return task


def delete(session: Session, task: Task) -> None:
    session.delete(task)
    session.flush()


def board(session: Session, project_id: int) -> tuple[list[Task], dict[int, int]]:
    """A project's tasks in board order, with assignees and tags loaded, and comment counts.

    Three statements whatever the number of tasks: the tasks joined to their assignees, one
    SELECT ... IN for all their tags, and one grouped count of comments.
    """
    statement = (
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.status, Task.position, Task.id)
    )
    tasks = list(session.scalars(statement))
    counts = (
        select(Comment.task_id, func.count())
        .join(Task, Task.id == Comment.task_id)
        .where(Task.project_id == project_id)
        .group_by(Comment.task_id)
    )
    return tasks, dict(session.execute(counts).all())


# ---------------------------------------------------------------- positions in a column


def lock_columns(session: Session, project_id: int, statuses: Iterable[TaskStatus]) -> list[Task]:
    """Locks every task in the given columns until the transaction ends, and reloads them.

    Rows are locked in id order, so two moves that touch the same columns always lock in
    the same order and never deadlock. `populate_existing` replaces values the session
    loaded earlier with the ones read under the lock.
    """
    statement = (
        select(Task)
        .where(Task.project_id == project_id, Task.status.in_(set(statuses)))
        .order_by(Task.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return list(session.scalars(statement))


def shift_positions(
    session: Session,
    project_id: int,
    status: TaskStatus,
    *,
    start: int,
    stop: int | None = None,
    by: int,
) -> None:
    """Adds `by` to the position of every task in a column with `start <= position < stop`.

    A bulk UPDATE, so the tasks that only slide along keep their version (and ETag).
    """
    conditions = [Task.project_id == project_id, Task.status == status, Task.position >= start]
    if stop is not None:
        conditions.append(Task.position < stop)
    session.execute(update(Task).where(*conditions).values(position=Task.position + by))


def next_position(session: Session, project_id: int, status: TaskStatus) -> int:
    """The position after the last task in a column, with the column locked first."""
    return len(lock_columns(session, project_id, [status]))


def move(session: Session, task: Task, status: TaskStatus, position: int | None = None) -> None:
    """Puts `task` in the `status` column at `position` (the end when `None`), and closes
    and opens gaps so both columns stay numbered 0, 1, 2, ... with no holes or repeats.

    Call it inside the transaction that commits the move: the locks it takes last until then.
    """
    locked = lock_columns(session, task.project_id, TaskStatus)  # the whole board
    source, origin = task.status, task.position  # as they are under the lock
    size = sum(1 for other in locked if other.status == status and other.id != task.id)
    target = size if position is None else min(position, size)

    if status == source:
        if target > origin:
            shift_positions(
                session, task.project_id, source, start=origin + 1, stop=target + 1, by=-1
            )
        elif target < origin:
            shift_positions(session, task.project_id, source, start=target, stop=origin, by=1)
    else:
        shift_positions(session, task.project_id, source, start=origin + 1, by=-1)
        shift_positions(session, task.project_id, status, start=target, by=1)

    task.status, task.position = status, target
