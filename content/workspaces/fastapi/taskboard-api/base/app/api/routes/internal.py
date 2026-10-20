"""Internal endpoints for operators and scheduled jobs: outside /v1 and outside the contract.

Every route here needs the `X-Internal-Key` header to match INTERNAL_API_KEY.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import require_internal_key
from app.core.clock import ClockDep
from app.db.session import SessionDep
from app.worker import process_outbox

router = APIRouter(
    prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_key)]
)


class OutboxRun(BaseModel):
    sent: int


@router.post("/outbox/run")
def run_outbox(session: SessionDep, clock: ClockDep) -> OutboxRun:
    """Sends what waits in the outbox now, as `uv run python -m app.worker --once` does."""
    return OutboxRun(sent=process_outbox(session, clock=clock))
