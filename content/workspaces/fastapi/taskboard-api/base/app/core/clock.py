"""The clock every timestamp comes from.

Code never calls `datetime.now()` or `date.today()` directly. It asks a `Clock`, which
routes get with `ClockDep` and hooks find on the session. With `HU_FIXED_TIME` set
(2026-10-01T09:00:00Z in development, tests, and checks) the clock stands still, so new
rows, tokens, and mail lines get predictable times, and "today" is 2026-10-01.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class Clock:
    fixed: datetime | None = None

    def now(self) -> datetime:
        if self.fixed is not None:
            return self.fixed.astimezone(UTC)
        return datetime.now(UTC)

    def today(self) -> date:
        return self.now().date()


def clock_from(settings: Settings) -> Clock:
    return Clock(fixed=settings.hu_fixed_time)


def get_clock() -> Clock:
    return clock_from(get_settings())


ClockDep = Annotated[Clock, Depends(get_clock)]
