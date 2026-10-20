"""The current user, their tasks, and the user search."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, PageDep
from app.db.session import SessionDep
from app.models.user import User
from app.schemas.common import Page
from app.schemas.task import TaskOut
from app.schemas.user import UserOut, UserSummary, UserUpdate
from app.services import tasks, users

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: CurrentUser, session: SessionDep) -> User:
    return users.update_profile(session, user, data)


@router.get("/me/tasks")
def my_tasks(user: CurrentUser, page: PageDep, session: SessionDep) -> Page[TaskOut]:
    """The tasks assigned to you, soonest due first."""
    return tasks.list_assigned(session, user, limit=page.limit, offset=page.offset)


@router.get("/users", response_model=list[UserSummary])
def search_users(
    _user: CurrentUser, session: SessionDep, q: Annotated[str | None, Query(max_length=100)] = None
) -> list[User]:
    """People whose name or email contains `q`, by name, at most 20. No `q` lists everyone."""
    return users.search(session, q)
