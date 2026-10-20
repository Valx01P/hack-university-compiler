"""Who watches a task: list, add, and remove. Adding and removing are idempotent (PUT and
DELETE), so a client can repeat them safely."""

from fastapi import APIRouter, Response, status

from app.api.deps import PathId, TaskMember, TaskReader
from app.core.clock import ClockDep
from app.db.session import SessionDep
from app.models.user import User
from app.schemas.user import UserRef
from app.services import watchers

router = APIRouter(prefix="/tasks/{task_id}/watchers", tags=["watchers"])


@router.get("", response_model=list[UserRef])
def list_watchers(target: TaskReader, session: SessionDep) -> list[User]:
    return watchers.list_watchers(session, target.task)


@router.put("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def watch(target: TaskMember, user_id: PathId, session: SessionDep, clock: ClockDep) -> Response:
    watchers.watch(session, target.task, user_id, clock=clock)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def unwatch(target: TaskMember, user_id: PathId, session: SessionDep) -> Response:
    watchers.unwatch(session, target.task, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
