"""Dependencies the routes share: who is calling, what they may touch, and how many rows.

- `CurrentUser`: the user behind a bearer token or the `tb_session` cookie. When the
  `Authorization` header is present it alone decides, so a bad bearer token is a 401 even
  next to a good cookie.
- `require_project_role(role)`, `require_task_role(role)`, and `require_comment_role(role)`:
  load the resource from the path, then check the caller's role in its project (404 for
  outsiders, 403 for a role too low). Routes use the aliases below, such as `ProjectOwner`.
- `PageParams` and `LimitParam`: `limit` and `offset` from the query string, checked
  against the settings (1 to 100).
- `require_internal_key`: the `X-Internal-Key` header for the routes under /internal.
"""

import secrets
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Path, Query, Request
from fastapi.security import APIKeyCookie, OAuth2PasswordBearer

from app.core.clock import ClockDep
from app.core.config import Settings, get_settings
from app.core.context import set_current_user
from app.core.errors import BadRequest, Forbidden, Unauthorized
from app.core.security import SESSION_COOKIE, AccessToken, InvalidToken, decode_token
from app.db.session import SessionDep
from app.models.comment import Comment
from app.models.project import ProjectRole
from app.models.task import Task
from app.models.user import User
from app.repositories import users
from app.schemas.common import MAX_ID
from app.services import comments, projects, tasks
from app.services.projects import ProjectAccess

# An id in the path: 1 to the largest INTEGER. Anything else is a 400, like a word.
PathId = Annotated[int, Path(ge=1, le=MAX_ID)]

SettingsDep = Annotated[Settings, Depends(get_settings)]

# Both schemes appear in /docs. Swagger's Authorize button posts the OAuth2 form to
# tokenUrl. auto_error=False, because get_access_token reads the credentials itself.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token", auto_error=False)
cookie_scheme = APIKeyCookie(name=SESSION_COOKIE, auto_error=False)


def get_access_token(
    request: Request,
    session: SessionDep,
    clock: ClockDep,
    settings: SettingsDep,
    _bearer: Annotated[str | None, Depends(oauth2_scheme)],
    _cookie: Annotated[str | None, Depends(cookie_scheme)],
) -> AccessToken:
    header = request.headers.get("Authorization")
    if header is not None:
        scheme, _, credentials = header.partition(" ")
        if scheme.lower() != "bearer" or not credentials.strip():
            raise Unauthorized("send Authorization: Bearer <token>")
        raw = credentials.strip()
    elif cookie := request.cookies.get(SESSION_COOKIE):
        raw = cookie
    else:
        raise Unauthorized()

    try:
        token = decode_token(raw, clock=clock, settings=settings)
    except InvalidToken:
        raise Unauthorized("the token is not valid, log in again") from None
    if users.is_revoked(session, token.jti):
        raise Unauthorized("this session has ended, log in again")
    return token


AccessTokenDep = Annotated[AccessToken, Depends(get_access_token)]


def get_current_user(token: AccessTokenDep, session: SessionDep) -> User:
    user = users.get(session, token.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("the account no longer exists or is disabled")
    set_current_user(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_internal_key(
    settings: SettingsDep, x_internal_key: Annotated[str, Header()] = ""
) -> None:
    """Guards internal endpoints. compare_digest takes as long for a wrong first character
    as for a wrong last one, so the key cannot be guessed one character at a time."""
    expected = settings.internal_api_key.get_secret_value()
    if not secrets.compare_digest(x_internal_key.encode(), expected.encode()):
        raise Forbidden("this endpoint needs the internal key in X-Internal-Key")


# ---------------------------------------------------------------- roles


@dataclass(frozen=True)
class TaskAccess:
    task: Task
    access: ProjectAccess


@dataclass(frozen=True)
class CommentAccess:
    comment: Comment
    access: ProjectAccess


def require_project_role(min_role: ProjectRole) -> Callable[..., ProjectAccess]:
    def dependency(project_id: PathId, user: CurrentUser, session: SessionDep) -> ProjectAccess:
        project = projects.load(session, project_id)
        return projects.authorize(session, user, project, min_role)

    return dependency


def require_task_role(min_role: ProjectRole) -> Callable[..., TaskAccess]:
    def dependency(task_id: PathId, user: CurrentUser, session: SessionDep) -> TaskAccess:
        task = tasks.load(session, task_id)
        return TaskAccess(task, projects.authorize(session, user, task.project, min_role))

    return dependency


def require_comment_role(min_role: ProjectRole) -> Callable[..., CommentAccess]:
    def dependency(comment_id: PathId, user: CurrentUser, session: SessionDep) -> CommentAccess:
        comment = comments.load(session, comment_id)
        return CommentAccess(
            comment, projects.authorize(session, user, comment.task.project, min_role)
        )

    return dependency


ProjectReader = Annotated[ProjectAccess, Depends(require_project_role(ProjectRole.VIEWER))]
ProjectMember = Annotated[ProjectAccess, Depends(require_project_role(ProjectRole.MEMBER))]
ProjectOwner = Annotated[ProjectAccess, Depends(require_project_role(ProjectRole.OWNER))]
TaskReader = Annotated[TaskAccess, Depends(require_task_role(ProjectRole.VIEWER))]
TaskMember = Annotated[TaskAccess, Depends(require_task_role(ProjectRole.MEMBER))]
TaskOwner = Annotated[TaskAccess, Depends(require_task_role(ProjectRole.OWNER))]
CommentMember = Annotated[CommentAccess, Depends(require_comment_role(ProjectRole.MEMBER))]


# ---------------------------------------------------------------- paging


@dataclass(frozen=True)
class PageParams:
    limit: int
    offset: int


def get_limit(settings: SettingsDep, limit: Annotated[int | None, Query()] = None) -> int:
    if limit is None:
        return settings.default_page_size
    if not 1 <= limit <= settings.max_page_size:
        message = f"must be a whole number from 1 to {settings.max_page_size}"
        raise BadRequest(f"limit {message}", errors={"limit": message})
    return limit


LimitParam = Annotated[int, Depends(get_limit)]


def get_page(limit: LimitParam, offset: Annotated[int, Query(ge=0, le=MAX_ID)] = 0) -> PageParams:
    return PageParams(limit=limit, offset=offset)


PageDep = Annotated[PageParams, Depends(get_page)]
