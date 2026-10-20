"""Comments: the body clients send and what the list returns."""

import unicodedata
from typing import Annotated

from pydantic import AfterValidator

from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.user import UserRef


def clean_body(text: str) -> str:
    """Control characters other than newlines are removed, then the ends are trimmed."""
    kept = "".join(ch for ch in text if ch == "\n" or unicodedata.category(ch) != "Cc")
    body = kept.strip()
    if not body:
        raise ValueError("must not be empty")
    if len(body) > 2000:
        raise ValueError("must be at most 2000 characters")
    return body


CommentBody = Annotated[str, AfterValidator(clean_body)]


class CommentCreate(InputModel):
    body: CommentBody


class CommentUpdate(InputModel):
    body: CommentBody


class CommentOut(OutputModel):
    id: int
    task_id: int
    author: UserRef
    body: str
    created_at: UtcDatetime
