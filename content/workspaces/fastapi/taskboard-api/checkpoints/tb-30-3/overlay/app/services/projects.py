"""Project rules: who may see and change a project, creating and changing projects, members.

Visibility follows the contract: a project is visible to its members, and an admin may read
any project. Something you cannot see is a 404 (so nobody learns it exists), and something
you can see but may not change is a 403.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.errors import Conflict, Forbidden, NotFound, Unprocessable
from app.models.project import Membership, Project, ProjectRole
from app.models.task import TaskStatus
from app.models.user import User
from app.repositories import projects, tasks, users
from app.schemas.project import (
    MemberIn,
    ProjectCreate,
    ProjectListItem,
    ProjectUpdate,
    TaskCounts,
)
from app.schemas.task import Board, BoardCard, BoardColumn
from app.schemas.user import UserRef


class ProjectArchived(Conflict):
    code = "project_archived"
    title = "Project archived"


@dataclass(frozen=True)
class ProjectAccess:
    """What `user` may do in `project`. `role` is `None` for an admin reading a project
    they are not a member of."""

    project: Project
    user: User
    role: ProjectRole | None

    @property
    def is_owner(self) -> bool:
        return self.role is not None and self.role.rank >= ProjectRole.OWNER.rank


def authorize(
    session: Session, user: User, project: Project, min_role: ProjectRole
) -> ProjectAccess:
    """Checks that `user` holds at least `min_role` in `project`, comparing ranks."""
    role = projects.role_of(session, project.id, user.id)
    if role is None:
        if not user.is_admin:
            raise NotFound(f"project {project.id} not found")
        if min_role is not ProjectRole.VIEWER:
            raise Forbidden("admins can read every project, but change only their own")
        return ProjectAccess(project, user, None)
    if role.rank < min_role.rank:
        raise Forbidden(f"this needs the {min_role} role in this project, and you are a {role}")
    return ProjectAccess(project, user, role)


def load(session: Session, project_id: int) -> Project:
    project = projects.get(session, project_id)
    if project is None:
        raise NotFound(f"project {project_id} not found")
    return project


def list_projects(session: Session, user: User) -> list[ProjectListItem]:
    return [
        ProjectListItem.of(row.project, row.role, TaskCounts(**row.counts))
        for row in projects.list_for_user(session, user.id)
    ]


def with_members(session: Session, project: Project) -> Project:
    loaded = projects.get_with_members(session, project.id)
    assert loaded is not None
    return loaded


def _check_name_free(
    session: Session, owner_id: int, name: str, *, exclude_id: int | None = None
) -> None:
    if projects.name_taken(session, owner_id, name, exclude_id=exclude_id):
        raise Conflict(
            "you already have a project with this name",
            errors={"name": "is already used by another of your projects"},
        )


def create_project(session: Session, user: User, data: ProjectCreate, *, clock: Clock) -> Project:
    """Any user may create a project, and becomes its owner."""
    _check_name_free(session, user.id, data.name)
    project = Project(
        name=data.name,
        description=data.description,
        color=data.color,
        start_date=data.start_date,
        owner_id=user.id,
    )
    project.memberships.append(Membership(user=user, role=ProjectRole.OWNER))
    projects.add(session, project)
    session.commit()
    return project


def update_project(session: Session, access: ProjectAccess, data: ProjectUpdate) -> Project:
    """Renames, restyles, reschedules, or archives a project (owners only, checked by the route)."""
    project = access.project
    changes = data.model_dump(exclude_unset=True)
    if (name := changes.pop("name", None)) is not None and name != project.name:
        _check_name_free(session, project.owner_id, name, exclude_id=project.id)
        projects.rename(session, project, name)
    for field, value in changes.items():
        setattr(project, field, value)
    session.commit()
    return project


def add_member(session: Session, access: ProjectAccess, data: MemberIn) -> Membership:
    invitee = users.get(session, data.user_id)
    if invitee is None:
        raise Unprocessable(f"there is no user {data.user_id}", errors={"user_id": "is not a user"})
    if projects.role_of(session, access.project.id, invitee.id) is not None:
        raise Conflict(
            f"{invitee.name} is already a member",
            errors={"user_id": "is already a member of this project"},
        )
    membership = projects.add_member(session, access.project, invitee, data.role)
    session.commit()
    return membership


def stats(session: Session, project: Project) -> TaskCounts:
    counts = tasks.count_by_status(session, project.id)
    return TaskCounts(**{status.value: number for status, number in counts.items()})


def board(session: Session, project: Project) -> Board:
    """The project's tasks as columns of cards, the way the board page draws them."""
    all_tasks, comment_counts = tasks.board(session, project.id)
    columns = {status: BoardColumn(status=status, tasks=[]) for status in TaskStatus}
    for task in all_tasks:
        columns[task.status].tasks.append(
            BoardCard(
                id=task.id,
                title=task.title,
                priority=task.priority,
                due_on=task.due_on,
                position=task.position,
                assignee=UserRef.model_validate(task.assignee) if task.assignee else None,
                tags=[tag.name for tag in task.tags],
                comment_count=comment_counts.get(task.id, 0),
            )
        )
    return Board(project_id=project.id, columns=list(columns.values()))
