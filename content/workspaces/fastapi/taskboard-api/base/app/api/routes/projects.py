"""Projects: your list, one project with its members, creating and changing them, members,
task counts, and the board."""

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, ProjectOwner, ProjectReader
from app.core.clock import ClockDep
from app.db.session import SessionDep
from app.schemas.project import (
    MemberIn,
    MemberOut,
    ProjectCreate,
    ProjectListItem,
    ProjectOut,
    ProjectUpdate,
    TaskCounts,
)
from app.schemas.task import Board
from app.services import projects

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects(user: CurrentUser, session: SessionDep) -> list[ProjectListItem]:
    """The projects you are a member of, by id, with their task counts."""
    return projects.list_projects(session, user)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate, user: CurrentUser, session: SessionDep, clock: ClockDep, response: Response
) -> ProjectOut:
    project = projects.create_project(session, user, data, clock=clock)
    response.headers["Location"] = f"/v1/projects/{project.id}"
    return ProjectOut.of(project)


@router.get("/{project_id}")
def read_project(access: ProjectReader, session: SessionDep) -> ProjectOut:
    return ProjectOut.of(projects.with_members(session, access.project))


@router.patch("/{project_id}")
def update_project(access: ProjectOwner, data: ProjectUpdate, session: SessionDep) -> ProjectOut:
    project = projects.update_project(session, access, data)
    return ProjectOut.of(projects.with_members(session, project))


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(access: ProjectOwner, data: MemberIn, session: SessionDep) -> MemberOut:
    return MemberOut.of(projects.add_member(session, access, data))


@router.get("/{project_id}/stats")
def project_stats(access: ProjectReader, session: SessionDep) -> TaskCounts:
    """How many of the project's tasks are in each status."""
    return projects.stats(session, access.project)


@router.get("/{project_id}/board")
def project_board(access: ProjectReader, session: SessionDep) -> Board:
    """The board page's data: a column per status, each card with its assignee, tags, and
    number of comments."""
    return projects.board(session, access.project)
