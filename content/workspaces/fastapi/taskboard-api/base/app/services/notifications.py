"""Notifications: mail for the people a change concerns, written to `var/mail.log`.

The app has no mail server. "Sending" a mail appends one line to the mail log, which the
explorer shows growing. Two delivery styles live here, because they fit different needs:

- `task_assigned` queues a line on the session, and the `after_commit` hook below writes
  it once the change is committed. A rolled back change writes nothing. Simple, but a
  crash between the commit and the write would lose that mail.
- `status_changed` writes `OutboxMessage` rows in the same transaction as the change. The
  worker (`app/worker.py`) sends them later and retries failures, so a mail is never lost
  and never sent for a change that did not happen.
"""

from collections.abc import Iterable
from datetime import datetime
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.orm import Session, SessionTransaction

from app.core.config import get_settings
from app.db.events import clock_for
from app.models.outbox import OutboxMessage
from app.models.task import Task, TaskStatus
from app.models.user import User

PENDING_MAIL = "pending_mail"


def mail_line(at: datetime, to: str, subject: str) -> str:
    return f'{at:%Y-%m-%dT%H:%M:%SZ} to={to} subject="{subject}"'


def deliver(path: Path, lines: Iterable[str]) -> None:
    """The fake mailer: appends each mail as one line of the mail log."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as log:
        log.writelines(f"{line}\n" for line in lines)


def mail_log_for(session: Session) -> Path:
    return session.info.get("mail_log") or get_settings().mail_log


def task_assigned(session: Session, task: Task, assignee: User) -> None:
    """Mails the new assignee, after the transaction commits."""
    at = clock_for(session).now()
    line = mail_line(at, assignee.email, f"You were assigned task {task.id}: {task.title}")
    session.info.setdefault(PENDING_MAIL, []).append(line)


def status_changed(
    session: Session,
    task: Task,
    old: TaskStatus,
    new: TaskStatus,
    *,
    actor: User,
    watchers: Iterable[User],
) -> None:
    """Queues one outbox message per watcher, except the person who made the change."""
    for watcher in watchers:
        if watcher.id == actor.id:
            continue
        session.add(
            OutboxMessage(
                kind="task.status_changed",
                payload={
                    "to": watcher.email,
                    "subject": f"Task {task.id} moved from {old} to {new}: {task.title}",
                    "task_id": task.id,
                    "actor_id": actor.id,
                },
            )
        )


@event.listens_for(Session, "after_commit")
def _send_pending_mail(session: Session) -> None:
    if session.in_nested_transaction():
        return  # only a SAVEPOINT was released: the transaction around it may still roll back
    if lines := session.info.pop(PENDING_MAIL, None):
        deliver(mail_log_for(session), lines)


@event.listens_for(Session, "after_soft_rollback")
def _drop_pending_mail(session: Session, previous_transaction: SessionTransaction) -> None:
    if previous_transaction.parent is None:  # the whole transaction, not a SAVEPOINT in it
        session.info.pop(PENDING_MAIL, None)
