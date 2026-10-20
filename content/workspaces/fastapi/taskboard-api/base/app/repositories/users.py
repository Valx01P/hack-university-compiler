"""Queries about users, and the tokens logout revoked."""

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.security import AccessToken
from app.models.user import RevokedToken, User
from app.repositories import escape_like


def get(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)


def get_by_email(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(User.email == email.strip().lower()))


def search(session: Session, q: str | None, *, limit: int = 20) -> list[User]:
    """Users whose name or email contains `q` (ignoring case), by name, then id."""
    statement = select(User).order_by(User.name, User.id).limit(limit)
    if q:
        pattern = f"%{escape_like(q)}%"
        statement = statement.where(
            or_(User.name.ilike(pattern, escape="\\"), User.email.ilike(pattern, escape="\\"))
        )
    return list(session.scalars(statement))


def add(session: Session, user: User) -> User:
    session.add(user)
    session.flush()
    return user


def is_revoked(session: Session, jti: str) -> bool:
    return session.get(RevokedToken, jti) is not None


def revoke(session: Session, token: AccessToken, *, revoked_at: datetime) -> None:
    session.execute(
        insert(RevokedToken)
        .values(
            jti=token.jti, user_id=token.user_id, expires_at=token.expires_at, revoked_at=revoked_at
        )
        .on_conflict_do_nothing(index_elements=[RevokedToken.jti])
    )
