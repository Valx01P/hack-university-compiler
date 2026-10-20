"""Comment rules: who may write, edit, and delete a comment, and the cursor for paging.

Object-level rules live here, because they depend on the comment itself and not only on
the caller's role: the author edits their own comment, and the author or a project owner
deletes it. The route has already checked that the caller is a member (or an admin
reading).
"""

import base64
import binascii
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import BadRequest, Forbidden, NotFound
from app.models.comment import Comment
from app.models.task import Task
from app.repositories import comments
from app.schemas.comment import CommentOut
from app.schemas.common import CursorPage
from app.services.projects import ProjectAccess

BAD_CURSOR = "is not a cursor this API issued"


def encode_cursor(comment: Comment) -> str:
    """An opaque string holding the last row's sort key, `(created_at, id)`."""
    key = {"created_at": comment.created_at.isoformat(), "id": comment.id}
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        key = json.loads(raw)
        created_at, comment_id = datetime.fromisoformat(key["created_at"]), key["id"]
    except (binascii.Error, ValueError, TypeError, KeyError) as error:
        raise BadRequest("the cursor is not valid", errors={"cursor": BAD_CURSOR}) from error
    if created_at.tzinfo is None or not isinstance(comment_id, int):
        raise BadRequest("the cursor is not valid", errors={"cursor": BAD_CURSOR})
    return created_at, comment_id


def list_comments(
    session: Session, task: Task, *, limit: int, cursor: str | None
) -> CursorPage[CommentOut]:
    after = decode_cursor(cursor) if cursor else None
    rows = comments.list_for_task(session, task.id, after=after, limit=limit + 1)
    page, more = rows[:limit], len(rows) > limit
    return CursorPage(
        items=[CommentOut.model_validate(comment) for comment in page],
        next_cursor=encode_cursor(page[-1]) if more else None,
    )


def load(session: Session, comment_id: int) -> Comment:
    comment = comments.get(session, comment_id)
    if comment is None:
        raise NotFound(f"comment {comment_id} not found")
    return comment


def add_comment(session: Session, task: Task, author_id: int, body: str) -> Comment:
    comment = comments.add(session, Comment(task_id=task.id, author_id=author_id, body=body))
    session.commit()
    return comment


def can_edit(access: ProjectAccess, comment: Comment) -> bool:
    """Only the author edits a comment: an owner may remove words, but not change them."""
    return access.role is not None


def can_delete(access: ProjectAccess, comment: Comment) -> bool:
    return comment.author_id == access.user.id or access.is_owner


def edit_comment(session: Session, access: ProjectAccess, comment: Comment, body: str) -> Comment:
    if not can_edit(access, comment):
        raise Forbidden("only the author can edit a comment")
    comment.body = body
    session.commit()
    return comment


def delete_comment(session: Session, access: ProjectAccess, comment: Comment) -> None:
    if not can_delete(access, comment):
        raise Forbidden("only the author or a project owner can delete a comment")
    comments.delete(session, comment)
    session.commit()
