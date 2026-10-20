"""Messages waiting to be sent, written in the same transaction as the change they announce.

If the transaction rolls back, the message was never written. If it commits, the worker
(`uv run python -m app.worker --once`) sends it later, retrying on failure, so a mail
server that is down never loses a notification or fails the request that caused it.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Identity, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin


class OutboxMessage(CreatedAtMixin, Base):
    __tablename__ = "outbox_messages"
    __table_args__ = (
        # Only unsent rows are indexed, so the worker's query stays fast as sent rows pile up.
        Index("ix_outbox_messages_unsent", "id", postgresql_where=text("sent_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    kind: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    sent_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(Text)
