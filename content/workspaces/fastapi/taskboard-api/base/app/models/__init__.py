"""Every model, imported here so `Base.metadata` knows them all (Alembic reads it)."""

from app.models.audit import AuditLog
from app.models.comment import Comment
from app.models.outbox import OutboxMessage
from app.models.project import DEFAULT_COLOR, Membership, Project, ProjectRole, RoleRank
from app.models.tag import Tag, task_tags
from app.models.task import TRANSITIONS, Task, TaskStatus
from app.models.user import RevokedToken, User, UserRole
from app.models.watcher import TaskWatcher

__all__ = [
    "DEFAULT_COLOR",
    "TRANSITIONS",
    "AuditLog",
    "Comment",
    "Membership",
    "OutboxMessage",
    "Project",
    "ProjectRole",
    "RevokedToken",
    "RoleRank",
    "Tag",
    "Task",
    "TaskStatus",
    "TaskWatcher",
    "User",
    "UserRole",
    "task_tags",
]
