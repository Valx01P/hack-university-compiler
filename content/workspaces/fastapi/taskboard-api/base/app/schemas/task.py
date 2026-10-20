"""Tasks: what clients send to create, edit, move, and list them, and what they get back."""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    Strict,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.tag import Tag
from app.models.task import MEDIUM, TaskStatus
from app.schemas.common import Id, InputModel, OutputModel, UtcDatetime
from app.schemas.user import UserRef

TaskTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
TaskDescription = Annotated[str, StringConstraints(max_length=2000)]
Priority = Annotated[int, Strict(), Field(ge=1, le=3)]


class TaskCreate(InputModel):
    title: TaskTitle
    description: TaskDescription | None = None
    priority: Priority = MEDIUM
    due_on: date | None = None
    assignee_id: Id | None = None


class TaskUpdate(InputModel):
    """Only the fields sent change. `null` clears `description`, `due_on`, or `assignee_id`.

    `status` is not here on purpose: it changes only through `POST .../transition`, so
    sending it is an unknown field (400), like any other.
    """

    title: TaskTitle | None = None
    description: TaskDescription | None = None
    priority: Priority | None = None
    due_on: date | None = None
    assignee_id: Id | None = None

    @field_validator("title", "priority")
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


class TransitionIn(InputModel):
    to: TaskStatus


class MoveIn(InputModel):
    """Where a card lands on the board: a column (its status) and a 0-based position in it."""

    status: TaskStatus | None = None
    position: Annotated[int, Strict(), Field(ge=0)]


class TaskOut(OutputModel):
    id: int
    project_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: int
    due_on: date | None
    assignee_id: int | None
    version: int
    completed_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    position: int


class TaskDetail(TaskOut):
    """`GET /v1/tasks/{task_id}`: the task and the names of its tags."""

    tags: list[str]

    @field_validator("tags", mode="before")
    @classmethod
    def tag_names(cls, tags: list[Tag | str]) -> list[str]:
        return [tag.name if isinstance(tag, Tag) else tag for tag in tags]


def assignee_filter(value: object) -> object:
    """`?assignee_id=2` is a user id, and `?assignee_id=none` means unassigned."""
    if value == "none" or isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdecimal() and int(value) > 0:
        return int(value)
    raise ValueError("must be a user id or none")


class TaskFilters(BaseModel):
    """The task list's query string. Every filter given must match (AND)."""

    status: TaskStatus | None = None
    assignee_id: Annotated[int | Literal["none"], BeforeValidator(assignee_filter)] | None = None
    q: Annotated[str, StringConstraints(min_length=2, max_length=100)] | None = None
    sort: Literal["due", "priority", "created", "title"] = "created"
    order: Literal["asc", "desc"] = "asc"


class BoardCard(OutputModel):
    id: int
    title: str
    priority: int
    due_on: date | None
    position: int
    version: int
    assignee: UserRef | None
    tags: list[str]
    comment_count: int


class BoardColumn(BaseModel):
    status: TaskStatus
    tasks: list[BoardCard]


class Board(BaseModel):
    """`GET /v1/projects/{project_id}/board`: a column per status, cards in position order."""

    project_id: int
    columns: list[BoardColumn]
