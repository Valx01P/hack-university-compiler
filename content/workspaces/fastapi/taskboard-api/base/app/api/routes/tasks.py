"""Tasks: a project's task list and new tasks, then one task by id, its edits, status
transitions, moves on the board, and deletion. Responses that return one task carry its
version as an ETag, which PATCH expects back in If-Match."""

from typing import Annotated

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    CurrentUser,
    PageDep,
    ProjectMember,
    ProjectReader,
    TaskMember,
    TaskOwner,
    TaskReader,
)
from app.core.clock import ClockDep
from app.db.session import SessionDep
from app.schemas.common import Page
from app.schemas.task import (
    MoveIn,
    TaskCreate,
    TaskDetail,
    TaskFilters,
    TaskOut,
    TaskUpdate,
    TransitionIn,
)
from app.services import tasks

router = APIRouter(tags=["tasks"])


@router.get("/projects/{project_id}/tasks")
def list_tasks(
    access: ProjectReader,
    filters: Annotated[TaskFilters, Query()],
    page: PageDep,
    session: SessionDep,
) -> Page[TaskOut]:
    return tasks.list_tasks(session, access.project, filters, limit=page.limit, offset=page.offset)


@router.post("/projects/{project_id}/tasks", status_code=status.HTTP_201_CREATED)
def create_task(
    access: ProjectMember,
    data: TaskCreate,
    session: SessionDep,
    clock: ClockDep,
    response: Response,
) -> TaskOut:
    task = tasks.create_task(session, access.project, data, clock=clock)
    response.headers["Location"] = f"/v1/tasks/{task.id}"
    response.headers["ETag"] = task.etag
    return TaskOut.model_validate(task)


@router.get("/tasks/{task_id}")
def read_task(target: TaskReader, session: SessionDep, response: Response) -> TaskDetail:
    task = tasks.detail(session, target.task)
    response.headers["ETag"] = task.etag
    return TaskDetail.model_validate(task)


@router.patch("/tasks/{task_id}")
def update_task(
    target: TaskMember,
    data: TaskUpdate,
    session: SessionDep,
    clock: ClockDep,
    response: Response,
    if_match: Annotated[str | None, Header()] = None,
) -> TaskOut:
    task = tasks.update_task(session, target.task, data, if_match=if_match, clock=clock)
    response.headers["ETag"] = task.etag
    return TaskOut.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_task(target: TaskOwner, session: SessionDep) -> Response:
    tasks.delete_task(session, target.task)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tasks/{task_id}/transition")
def transition_task(
    target: TaskMember,
    data: TransitionIn,
    user: CurrentUser,
    session: SessionDep,
    clock: ClockDep,
    response: Response,
) -> TaskOut:
    task = tasks.transition_task(session, target.task, data.to, actor=user, clock=clock)
    response.headers["ETag"] = task.etag
    return TaskOut.model_validate(task)


@router.post("/tasks/{task_id}/move")
def move_task(
    target: TaskMember,
    data: MoveIn,
    user: CurrentUser,
    session: SessionDep,
    clock: ClockDep,
    response: Response,
) -> TaskOut:
    """Drags a card to a position in its column or another one (an extension)."""
    task = tasks.move_task(session, target.task, data, actor=user, clock=clock)
    response.headers["ETag"] = task.etag
    return TaskOut.model_validate(task)
