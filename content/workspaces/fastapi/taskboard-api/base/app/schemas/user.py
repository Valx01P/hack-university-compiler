"""Users as the API shows them: in full to themselves, and smaller inside other resources."""

import re
from typing import Annotated

from pydantic import AfterValidator, StringConstraints

from app.models.user import UserRole
from app.schemas.common import InputModel, OutputModel, UtcDatetime

_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def normalized_email(value: str) -> str:
    """Trimmed and lowercased, with one `@` and a `.` after it."""
    email = value.strip().lower()
    if not _EMAIL.fullmatch(email):
        raise ValueError("must be an email address, such as ada@example.com")
    return email


Email = Annotated[str, AfterValidator(normalized_email)]
UserName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class UserOut(OutputModel):
    """The current user (`GET /v1/me`), or a new account."""

    id: int
    email: str
    name: str
    role: UserRole
    created_at: UtcDatetime


class UserSummary(OutputModel):
    """A search result: enough to add someone to a project."""

    id: int
    name: str
    email: str


class UserRef(OutputModel):
    """A person shown inside another resource (a comment's author, a watcher). No email."""

    id: int
    name: str


class UserUpdate(InputModel):
    name: UserName
