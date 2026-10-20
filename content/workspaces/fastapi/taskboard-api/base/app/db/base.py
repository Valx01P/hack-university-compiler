"""The declarative base every model inherits, and the timestamp columns most of them share."""

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, Enum, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Stable names for every constraint and index, so migrations can refer to them and
# `alembic check` compares like with like.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: DateTime(timezone=True), date: Date()}


def string_enum(enum: type[StrEnum], name: str) -> Enum:
    """A `varchar` column holding an enum's values (`"doing"`), guarded by a CHECK constraint.

    A plain string column with a CHECK constraint is easier to change in a migration than
    a PostgreSQL ENUM type, and `values_callable` stores the values rather than the names.
    """
    return Enum(
        enum,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )


class CreatedAtMixin:
    """`created_at`, set from the clock by the `before_flush` hook in `app/db/events.py`."""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class TimestampMixin(CreatedAtMixin):
    """`created_at` and `updated_at`. The hook moves `updated_at` only when a column changed."""

    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
