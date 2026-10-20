"""Queries about comments: a task's comments page by page, oldest first."""

from datetime import datetime

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session, joinedload

from app.models.comment import Comment


def list_for_task(
    session: Session, task_id: int, *, after: tuple[datetime, int] | None, limit: int
) -> list[Comment]:
    """Up to `limit` comments, ordered by (created_at, id), starting after the key `after`.

    A keyset page: it compares (created_at, id) with the last row of the previous page,
    so rows added in between never shift or repeat a page, and comments with the same
    created_at still come in a fixed order.
    """
    statement = (
        select(Comment)
        .where(Comment.task_id == task_id)
        .options(joinedload(Comment.author))
        .order_by(Comment.created_at, Comment.id)
        .limit(limit)
    )
    if after is not None:
        statement = statement.where(tuple_(Comment.created_at, Comment.id) > tuple_(*after))
    return list(session.scalars(statement))


def get(session: Session, comment_id: int) -> Comment | None:
    return session.get(Comment, comment_id)


def add(session: Session, comment: Comment) -> Comment:
    session.add(comment)
    session.flush()
    return comment


def delete(session: Session, comment: Comment) -> None:
    session.delete(comment)
    session.flush()
