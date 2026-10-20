"""Comments on a task, read oldest first by cursor, plus editing and deleting one."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CommentMember, CurrentUser, LimitParam, TaskMember, TaskReader
from app.db.session import SessionDep
from app.schemas.comment import CommentCreate, CommentOut, CommentUpdate
from app.schemas.common import CursorPage
from app.services import comments

router = APIRouter(tags=["comments"])


@router.get("/tasks/{task_id}/comments")
def list_comments(
    target: TaskReader,
    limit: LimitParam,
    session: SessionDep,
    cursor: Annotated[str | None, Query()] = None,
) -> CursorPage[CommentOut]:
    """Pass the `next_cursor` of one page as `cursor` to get the next. `null` means the end."""
    return comments.list_comments(session, target.task, limit=limit, cursor=cursor)


@router.post("/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(
    target: TaskMember, data: CommentCreate, user: CurrentUser, session: SessionDep
) -> CommentOut:
    return CommentOut.model_validate(comments.add_comment(session, target.task, user.id, data.body))


@router.patch("/comments/{comment_id}")
def edit_comment(target: CommentMember, data: CommentUpdate, session: SessionDep) -> CommentOut:
    """Only the author edits a comment (an extension)."""
    comment = comments.edit_comment(session, target.access, target.comment, data.body)
    return CommentOut.model_validate(comment)


@router.delete(
    "/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
def delete_comment(target: CommentMember, session: SessionDep) -> Response:
    """The author, or an owner of the project, deletes a comment."""
    comments.delete_comment(session, target.access, target.comment)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
