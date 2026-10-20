"""Task positions: each task's place in its board column, backfilled from the existing order.

A new NOT NULL column on a table that already has rows takes three steps: add it as
nullable, fill it, then make it NOT NULL. The backfill numbers the tasks of each column
(project and status) 0, 1, 2, ... in id order, with a window function in one UPDATE.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-20 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("position", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE tasks
        SET position = numbered.row_number - 1
        FROM (
            SELECT id, row_number() OVER (PARTITION BY project_id, status ORDER BY id)
            FROM tasks
        ) AS numbered
        WHERE tasks.id = numbered.id
        """
    )
    op.alter_column("tasks", "position", nullable=False, server_default="0")
    op.create_index(
        "ix_tasks_project_id_status_position", "tasks", ["project_id", "status", "position"]
    )
    op.drop_index("ix_tasks_project_id_status", table_name="tasks")


def downgrade() -> None:
    op.create_index("ix_tasks_project_id_status", "tasks", ["project_id", "status"])
    op.drop_index("ix_tasks_project_id_status_position", table_name="tasks")
    op.drop_column("tasks", "position")
