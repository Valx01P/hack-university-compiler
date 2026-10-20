"""JSON logs: one object per line, each carrying the id of the request that wrote it.

`logger.info("task created", extra={"task_id": 19})` prints
`{"time": "...", "level": "INFO", "logger": "taskboard.tasks", "message": "task created",
"request_id": "0199...", "user_id": 2, "task_id": 19}`.
"""

import json
import logging
from datetime import UTC, datetime

from app.core.context import current_request_id, current_user_id

_STANDARD_ATTRIBUTES = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id()
        record.user_id = current_user_id()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _STANDARD_ATTRIBUTES and value is not None:
                entry[key] = value
        if record.exc_info:
            entry["error"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Sends the app's `taskboard.*` loggers to stderr as JSON. Uvicorn keeps its own format.

    Records still propagate to the root logger, which has no handler under Uvicorn, so
    nothing prints twice, and pytest's `caplog` (a root handler) still sees them.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestContextFilter())
    logger = logging.getLogger("taskboard")
    logger.handlers[:] = [handler]
    logger.setLevel(level)
