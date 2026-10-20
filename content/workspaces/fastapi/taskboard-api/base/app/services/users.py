"""People: finding them, and changing your own profile."""

from sqlalchemy.orm import Session

from app.models.user import User
from app.repositories import users
from app.schemas.user import UserUpdate

SEARCH_LIMIT = 20


def search(session: Session, q: str | None) -> list[User]:
    """Name or email contains `q`, ignoring case. An empty `q` lists everyone, by name."""
    return users.search(session, q or None, limit=SEARCH_LIMIT)


def update_profile(session: Session, user: User, data: UserUpdate) -> User:
    user.name = data.name
    session.commit()
    return user
