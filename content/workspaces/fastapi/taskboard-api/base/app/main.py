"""The app factory: settings, logging, error handlers, routers, and middleware in one place.

`fastapi dev` and `fastapi run` find `app` through `[tool.fastapi] entrypoint` in
`pyproject.toml`. Tests call `create_app()` for a fresh app of their own.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, comments, health, internal, projects, tasks, users, watchers
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.db.session import engine
from app.middleware import RequestContextMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    engine.dispose()  # close pooled connections on shutdown


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        summary="Projects, tasks, comments, and watchers. Serves the Taskboard contract 1.0.0.",
        lifespan=lifespan,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    register_error_handlers(app)

    api = APIRouter(prefix="/v1")
    for module in (auth, users, projects, tasks, comments, watchers):
        api.include_router(module.router)
    app.include_router(health.router)
    app.include_router(api)
    app.include_router(internal.router)

    # The last middleware added runs first. CORS goes outside the request id middleware,
    # so preflights are answered at once and every response, errors included, gets the
    # CORS headers a browser needs to read it.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "If-Match"],
        expose_headers=["ETag", "Location", "X-Request-ID"],
    )
    return app


app = create_app()
