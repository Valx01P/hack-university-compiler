"""Projects, their members, and the task counts a board shows."""

import re
from datetime import date
from typing import Annotated, Self

from pydantic import AfterValidator, Strict, StringConstraints, field_validator, model_validator

from app.models.project import DEFAULT_COLOR, Membership, Project, ProjectRole
from app.schemas.common import Id, InputModel, OutputModel, UtcDatetime

_COLOR = re.compile(r"#[0-9a-f]{6}")


def normalized_color(value: str) -> str:
    color = value.strip().lower()
    if not _COLOR.fullmatch(color):
        raise ValueError("must be a color written #rrggbb, such as #2563eb")
    return color


Color = Annotated[str, AfterValidator(normalized_color)]
ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)]
ProjectDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class ProjectCreate(InputModel):
    name: ProjectName
    description: ProjectDescription | None = None
    color: Color = DEFAULT_COLOR
    start_date: date | None = None


class ProjectUpdate(InputModel):
    """Only the fields sent change. `description` and `start_date` accept `null` to clear them."""

    name: ProjectName | None = None
    description: ProjectDescription | None = None
    color: Color | None = None
    start_date: date | None = None
    archived: Annotated[bool, Strict()] | None = None

    @field_validator("name", "color", "archived")
    @classmethod
    def not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("may not be null")
        return value

    @model_validator(mode="after")
    def changes_something(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("send at least one field to change")
        return self


class TaskCounts(OutputModel):
    todo: int = 0
    doing: int = 0
    done: int = 0


class MemberIn(InputModel):
    user_id: Id
    role: ProjectRole = ProjectRole.MEMBER


class MemberOut(OutputModel):
    user_id: int
    name: str
    email: str
    role: ProjectRole

    @classmethod
    def of(cls, membership: Membership) -> Self:
        user = membership.user
        return cls(user_id=user.id, name=user.name, email=user.email, role=membership.role)


class ProjectFields(OutputModel):
    id: int
    name: str
    description: str | None
    color: str
    owner_id: int
    created_at: UtcDatetime
    slug: str
    start_date: date | None
    archived: bool


class ProjectListItem(ProjectFields):
    """A row of `GET /v1/projects`: your role in the project and its task counts."""

    role: ProjectRole
    task_counts: TaskCounts

    @classmethod
    def of(cls, project: Project, role: ProjectRole, counts: TaskCounts) -> Self:
        fields = ProjectFields.model_validate(project).model_dump()
        return cls(**fields, role=role, task_counts=counts)


class ProjectOut(ProjectFields):
    """A project with its members, sorted by user id."""

    members: list[MemberOut]

    @classmethod
    def of(cls, project: Project) -> Self:
        fields = ProjectFields.model_validate(project).model_dump()
        return cls(**fields, members=[MemberOut.of(member) for member in project.memberships])
