"""Errors as RFC 9457 problems, defined once for the whole API.

Services raise `AppError` subclasses that say what went wrong in the domain's words
(`NotFound("task 999 not found")`) and know nothing about responses. The handlers at the
bottom turn those, FastAPI's validation errors, and Starlette's HTTP errors into one shape:
`application/problem+json` with `type`, `title`, `status`, `detail`, `errors` (field name to
message) when a field is to blame, and the request's id as `request_id`.
"""

import logging
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any, ClassVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.context import current_request_id

logger = logging.getLogger("taskboard.errors")

PROBLEM_JSON = "application/problem+json"
PROBLEM_TYPES = "https://taskboard.example.com/problems/"


class AppError(Exception):
    """A failure the client can act on. `code` names a domain rule and becomes the `type`."""

    status: ClassVar[HTTPStatus] = HTTPStatus.INTERNAL_SERVER_ERROR
    code: ClassVar[str | None] = None
    title: ClassVar[str | None] = None

    def __init__(
        self,
        detail: str,
        *,
        errors: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
        extra: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.errors = dict(errors) if errors else None
        self.headers = dict(headers) if headers else {}
        self.extra = dict(extra) if extra else {}


class BadRequest(AppError):
    status = HTTPStatus.BAD_REQUEST


class Unauthorized(AppError):
    status = HTTPStatus.UNAUTHORIZED

    def __init__(self, detail: str = "log in to continue") -> None:
        super().__init__(detail, headers={"WWW-Authenticate": "Bearer"})


class Forbidden(AppError):
    status = HTTPStatus.FORBIDDEN


class NotFound(AppError):
    status = HTTPStatus.NOT_FOUND


class Conflict(AppError):
    status = HTTPStatus.CONFLICT


class Locked(Conflict):
    """The resource is in a state that forbids this change, such as a done task."""


class PreconditionFailed(AppError):
    status = HTTPStatus.PRECONDITION_FAILED


class PreconditionRequired(AppError):
    status = HTTPStatus.PRECONDITION_REQUIRED


class Unprocessable(AppError):
    status = HTTPStatus.UNPROCESSABLE_CONTENT


def problem(
    status: int,
    detail: str,
    *,
    code: str | None = None,
    title: str | None = None,
    errors: Mapping[str, str] | None = None,
    headers: Mapping[str, str] | None = None,
    extra: Mapping[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"{PROBLEM_TYPES}{code}" if code else "about:blank",
        "title": title or HTTPStatus(status).phrase,
        "status": int(status),
        "detail": detail,
    }
    if errors:
        body["errors"] = dict(errors)
    if extra:
        body.update(extra)
    if request_id := current_request_id():
        body["request_id"] = request_id
    return JSONResponse(body, status_code=status, headers=headers, media_type=PROBLEM_JSON)


# ---------------------------------------------------------------- validation errors

# A date that does not exist (2026-13-01) breaks a rule (422), although Pydantic reports it
# as a parsing error, which otherwise means a malformed request (400).
_DATE_RULES = {
    "date_parsing",
    "date_from_datetime_parsing",
    "date_from_datetime_inexact",
    "datetime_parsing",
    "datetime_from_date_parsing",
}


def is_malformed(error: Mapping[str, Any]) -> bool:
    """The contract's split: 400 for a malformed request, 422 for a body that breaks a rule."""
    location, kind = error["loc"], error["type"]
    if location[0] != "body":
        return True  # path, query, header, and cookie parameters
    if kind in {"json_invalid", "extra_forbidden"}:
        return True
    if len(location) == 1 and kind == "missing":
        return True  # no body at all
    if kind in _DATE_RULES:
        return False
    return kind.endswith(("_type", "_parsing"))


def field_name(location: Sequence[str | int]) -> str:
    """`("query", "limit")` is `limit`, and `("body", "members", 0, "role")` is `members.0.role`."""
    source, *path = location
    if source != "body":
        return str(path[0]) if path else str(source)
    if not path or isinstance(path[0], int):
        return "body"  # the whole body, or the position of a JSON syntax error
    return ".".join(str(part) for part in path)


def message_for(error: Mapping[str, Any]) -> str:
    kind, context = error["type"], error.get("ctx") or {}
    match kind:
        case "missing":
            return "is required"
        case "extra_forbidden":
            return "is not a field this endpoint accepts"
        case "json_invalid":
            return "is not valid JSON"
        case "string_too_short" if context.get("min_length") == 1:
            return "must not be empty"
        case "string_too_short":
            return f"must be at least {context['min_length']} characters"
        case "string_too_long":
            return f"must be at most {context['max_length']} characters"
        case "greater_than_equal":
            return f"must be at least {context['ge']}"
        case "less_than_equal":
            return f"must be at most {context['le']}"
        case "int_type" | "int_parsing" | "int_from_float":
            return "must be a whole number"
        case "string_type":
            return "must be a string"
        case "bool_type" | "bool_parsing":
            return "must be true or false"
        case "enum" | "literal_error":
            return f"must be one of {context.get('expected', 'the allowed values')}"
        case kind if kind in _DATE_RULES:
            return "must be a real date, written YYYY-MM-DD"
        case "value_error":
            return str(context.get("error") or error["msg"])
        case _:
            return str(error["msg"])


def validation_problem(exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, str] = {}
    for error in exc.errors():
        errors.setdefault(field_name(error["loc"]), message_for(error))
    malformed = any(is_malformed(error) for error in exc.errors())
    status = HTTPStatus.BAD_REQUEST if malformed else HTTPStatus.UNPROCESSABLE_CONTENT
    summary = "; ".join(f"{name} {message}" for name, message in list(errors.items())[:3])
    return problem(status, summary, errors=errors)


# ---------------------------------------------------------------- handlers


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return problem(
            exc.status,
            exc.detail,
            code=exc.code,
            title=exc.title,
            errors=exc.errors,
            headers=exc.headers,
            extra=exc.extra,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return validation_problem(exc)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else HTTPStatus(exc.status_code).phrase
        return problem(exc.status_code, detail.lower(), headers=exc.headers)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return problem(HTTPStatus.INTERNAL_SERVER_ERROR, "something went wrong on our side")
