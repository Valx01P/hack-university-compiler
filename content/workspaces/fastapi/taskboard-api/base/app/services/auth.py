"""Accounts and sessions: signing up, checking a password, issuing and revoking tokens.

Both logins (the contract's JSON `POST /v1/auth/login` and the OAuth2 form endpoint
`POST /v1/auth/token`) call `authenticate`, so they accept and refuse the same things.
"""

from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import Conflict, Unauthorized
from app.core.security import (
    AccessToken,
    create_access_token,
    dummy_hash,
    hash_password,
    verify_password,
)
from app.models.user import User, UserRole
from app.repositories import users
from app.schemas.auth import SignupIn

WRONG_CREDENTIALS = "wrong email or password"


def signup(session: Session, data: SignupIn) -> User:
    if users.get_by_email(session, data.email) is not None:
        raise Conflict(
            "an account with this email already exists",
            errors={"email": "is already registered"},
        )
    user = users.add(
        session,
        User(
            email=data.email,
            name=data.name,
            hashed_password=hash_password(data.password),
            role=UserRole.MEMBER,
        ),
    )
    session.commit()
    return user


def authenticate(session: Session, email: str, password: str) -> User:
    """The user with this email and password. An unknown email and a wrong password fail
    the same way and take the same time, so nobody can probe which emails have accounts."""
    user = users.get_by_email(session, email)
    if user is None:
        verify_password(password, dummy_hash())
        raise Unauthorized(WRONG_CREDENTIALS)
    if not verify_password(password, user.hashed_password) or not user.is_active:
        raise Unauthorized(WRONG_CREDENTIALS)
    return user


def issue_token(user: User, *, clock: Clock, settings: Settings) -> AccessToken:
    return create_access_token(user.id, clock=clock, settings=settings)


def logout(session: Session, token: AccessToken, *, clock: Clock) -> None:
    """Revokes this one token: it stops working at once, everywhere."""
    users.revoke(session, token, revoked_at=clock.now())
    session.commit()
