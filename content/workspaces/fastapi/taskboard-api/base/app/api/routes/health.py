"""Liveness and readiness, outside /v1: what a load balancer or an orchestrator polls."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_engine

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class Readiness(BaseModel):
    status: Literal["ready", "not_ready"]
    checks: dict[str, str]


@router.get("/healthz")
def healthz() -> Health:
    """The process is up. It never touches the database, so a slow database cannot fail it."""
    return Health()


@router.get(
    "/readyz",
    response_model=Readiness,
    responses={503: {"model": Readiness, "description": "Not ready"}},
)
def readyz(engine: Annotated[Engine, Depends(get_engine)]) -> Readiness | JSONResponse:
    """The process can serve requests: the database answers within a second."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SET LOCAL statement_timeout = '1s'"))
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        body = Readiness(status="not_ready", checks={"db": "down"})
        return JSONResponse(body.model_dump(), status_code=503)
    return Readiness(status="ready", checks={"db": "ok"})
