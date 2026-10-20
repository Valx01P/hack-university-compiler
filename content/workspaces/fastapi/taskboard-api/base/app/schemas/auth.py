"""Bodies for signup and the two ways to log in."""

from typing import Annotated

from pydantic import AfterValidator

from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.user import Email, UserName, UserOut


def password_rules(password: str) -> str:
    """12 characters or more, and at most 72 bytes, the most bcrypt ever reads."""
    if len(password) < 12:
        raise ValueError("must be at least 12 characters")
    if len(password.encode()) > 72:
        raise ValueError("must be at most 72 bytes")
    return password


Password = Annotated[str, AfterValidator(password_rules)]


class SignupIn(InputModel):
    email: Email
    name: UserName
    password: Password


class LoginIn(InputModel):
    email: Annotated[str, AfterValidator(lambda email: email.strip().lower())]
    password: str


class LoginOut(OutputModel):
    """`POST /v1/auth/login`: the token, when it expires, and who it belongs to."""

    token: str
    expires_at: UtcDatetime
    user: UserOut


class Token(OutputModel):
    """`POST /v1/auth/token`, the OAuth2 form endpoint Swagger UI's Authorize button calls."""

    access_token: str
    token_type: str = "bearer"
