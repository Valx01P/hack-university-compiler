"""Middleware that wraps every request: a request id, timing, and one log line.

A pure ASGI middleware (a class with `__call__(scope, receive, send)`) instead of
`@app.middleware("http")`, because it never buffers the response, so streaming responses
stream, and it costs less per request.

- `X-Request-ID`: kept from the request when it is a valid UUID (a gateway may set one),
  otherwise a new UUIDv7 (time-ordered), echoed in the response, bound to the request
  context for logs and problems.
- `X-Process-Time-Ms`: how long the app took, in milliseconds.
"""

import logging
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.context import request_scope

logger = logging.getLogger("taskboard.requests")


def request_id_from(headers: Headers) -> str:
    incoming = headers.get("x-request-id", "")
    try:
        return str(uuid.UUID(incoming))
    except ValueError:
        return str(uuid.uuid7())


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = request_id_from(Headers(scope=scope))
        started = time.perf_counter()
        status = 500

        async def send_with_headers(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                headers["X-Process-Time-Ms"] = str(round((time.perf_counter() - started) * 1000))
            await send(message)

        with request_scope(request_id):
            try:
                await self.app(scope, receive, send_with_headers)
            finally:
                logger.info(
                    "%s %s %s",
                    scope["method"],
                    scope["path"],
                    status,
                    extra={
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    },
                )
