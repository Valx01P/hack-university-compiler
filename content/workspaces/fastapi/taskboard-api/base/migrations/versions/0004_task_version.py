"""Task versions: a counter that every change adds 1 to, sent as the ETag.

PATCH /v1/tasks/{task_id} compares If-Match with it, and SQLAlchemy's version_id_col
checks it again in the UPDATE's WHERE clause. Existing rows start at version 1.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-08 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("version", sa.Integer(), server_default="1", nullable=False))


def downgrade() -> None:
    op.drop_column("tasks", "version")
