"""Accounts, and the access tokens revoked before they expired."""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, Identity, String, true
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.db.base import Base, TimestampMixin, string_enum


class UserRole(StrEnum):
    """An account's role across the whole app. Project roles live on `Membership`."""

    ADMIN = "admin"
    MEMBER = "member"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50))
    role: Mapped[UserRole] = mapped_column(
        string_enum(UserRole, "role"), default=UserRole.MEMBER, server_default=UserRole.MEMBER.value
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())

    @validates("email")
    def normalize_email(self, _key: str, email: str) -> str:
        """Stored trimmed and lowercased, however it arrives, so the unique index ignores case."""
        return email.strip().lower()

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN

    def __repr__(self) -> str:
        return f"User(id={self.id!r}, email={self.email!r})"


class RevokedToken(Base):
    """A token that logout ended. Rows can be deleted once `expires_at` has passed."""

    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime]
