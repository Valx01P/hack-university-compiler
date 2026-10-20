"""Shapes and field types that many endpoints share: input and output bases, the two page
envelopes, and the problem body that every error uses."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, Strict


def rfc3339(value: datetime) -> str:
    """UTC with a `Z`, as the contract writes times: `2026-10-01T09:00:00Z`."""
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


UtcDatetime = Annotated[datetime, PlainSerializer(rfc3339, return_type=str)]

# The largest id an INTEGER column holds. A bigger one could never match a row, and
# PostgreSQL would refuse to compare it, so it is refused before any query.
MAX_ID = 2_147_483_647

# Strict, so a number sent as a string ("3") is a wrong JSON type (400), not a 3.
Id = Annotated[int, Strict(), Field(ge=1, le=MAX_ID)]


class InputModel(BaseModel):
    """A request body. Unknown fields are refused (400), so a typo never passes silently."""

    model_config = ConfigDict(extra="forbid")


class OutputModel(BaseModel):
    """A response body, built from ORM objects with `model_validate(obj)`."""

    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    """One page of a list, and how many items match in all."""

    items: list[T]
    total: int
    limit: int
    offset: int


class CursorPage[T](BaseModel):
    """One page of a list read by cursor. `next_cursor` is `None` on the last page."""

    items: list[T]
    next_cursor: str | None


class Problem(BaseModel):
    """An RFC 9457 problem, the body of every error response."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str
    errors: dict[str, str] | None = None
    request_id: str | None = None
