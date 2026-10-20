"""The outbox worker: sends the messages services wrote to `outbox_messages`.

    uv run python -m app.worker --once      process what is waiting, then exit
    uv run python -m app.worker             keep polling every 2 seconds until Ctrl+C

Each batch locks its rows with FOR UPDATE SKIP LOCKED, so two workers running at once never
pick the same message: the second skips rows the first holds. A message is marked sent in
the same transaction that locked it. A failure records the error and leaves the message
for the next run, up to MAX_ATTEMPTS tries.
"""

import argparse
import contextlib
import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import Clock, get_clock
from app.core.logging import configure_logging
from app.db.session import SessionLocal, settings
from app.models.outbox import OutboxMessage
from app.services.notifications import deliver, mail_line, mail_log_for

logger = logging.getLogger("taskboard.worker")

MAX_ATTEMPTS = 5


def process_outbox(session: Session, *, limit: int = 100, clock: Clock) -> int:
    """Sends up to `limit` waiting messages, oldest first, and returns how many were sent."""
    statement = (
        select(OutboxMessage)
        .where(OutboxMessage.sent_at.is_(None), OutboxMessage.attempts < MAX_ATTEMPTS)
        .order_by(OutboxMessage.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    sent = 0
    for message in session.scalars(statement):
        message.attempts += 1
        try:
            line = mail_line(clock.now(), message.payload["to"], message.payload["subject"])
            deliver(mail_log_for(session), [line])
        except (KeyError, OSError) as error:
            message.last_error = f"{type(error).__name__}: {error}"
            logger.warning(
                "outbox message %s failed", message.id, extra={"error": message.last_error}
            )
            continue
        message.sent_at = clock.now()
        sent += 1
    session.commit()
    return sent


def main() -> None:
    parser = argparse.ArgumentParser(description="Send the messages waiting in the outbox.")
    parser.add_argument("--once", action="store_true", help="process one batch, then exit")
    parser.add_argument("--limit", type=int, default=100, help="messages per batch (default 100)")
    args = parser.parse_args()

    configure_logging()
    clock = get_clock()
    while True:
        with SessionLocal(info={"clock": clock, "mail_log": settings.mail_log}) as session:
            sent = process_outbox(session, limit=args.limit, clock=clock)
        if args.once or sent:
            print(f"sent {sent} message{'' if sent == 1 else 's'}")
        if args.once:
            return
        time.sleep(2)


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        main()
