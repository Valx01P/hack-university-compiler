"""Who is asking, and which request this is, for code that has no `request` to read.

The middleware binds a `RequestContext` at the start of every request, and
`get_current_user` fills in the user. Hooks (the audit log) and the JSON log formatter read
it back. One mutable object per request is stored in the context variable, because sync
dependencies and routes run in worker threads that get a copy of the context: a copy of a
reference still points at the same object, so the user set in one thread is visible in the
next.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class RequestContext:
    request_id: str
    user_id: int | None = None


_current: ContextVar[RequestContext | None] = ContextVar("request_context", default=None)


@contextmanager
def request_scope(request_id: str, user_id: int | None = None) -> Iterator[RequestContext]:
    """Binds a context for the duration of a `with` block (a request, a script, a test)."""
    context = RequestContext(request_id=request_id, user_id=user_id)
    token = _current.set(context)
    try:
        yield context
    finally:
        _current.reset(token)


def current_request_id() -> str | None:
    context = _current.get()
    return context.request_id if context else None


def current_user_id() -> int | None:
    context = _current.get()
    return context.user_id if context else None


def set_current_user(user_id: int) -> None:
    context = _current.get()
    if context is not None:
        context.user_id = user_id
