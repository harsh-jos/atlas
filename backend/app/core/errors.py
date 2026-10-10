"""Safe failure descriptions and diagnostic locations, without exception values or inputs."""

import logging
import traceback
from contextvars import ContextVar
from dataclasses import dataclass

import httpx
from sqlalchemy.exc import IntegrityError, OperationalError, TimeoutError as PoolTimeout

request_id = ContextVar("request_id", default="-")
turn_id = ContextVar("turn_id", default="-")


class AppError(RuntimeError):
    def __init__(self, message: str, code: str = "internal_error", status: int = 500):
        super().__init__(message)
        self.code, self.status = code, status


@dataclass(frozen=True)
class Failure:
    code: str
    message: str
    status: int


def describe(error: Exception) -> Failure:
    if isinstance(error, AppError):
        return Failure(error.code, str(error), error.status)
    if isinstance(error, (OperationalError, PoolTimeout)):
        return Failure(
            "database_unavailable", "Atlas could not reach its data. Try again later.", 503
        )
    if isinstance(error, IntegrityError):
        return Failure(
            "conflict", "This change conflicts with existing data. Refresh and try again.", 409
        )
    if isinstance(error, (TimeoutError, httpx.TimeoutException)):
        return Failure("timeout", "Atlas could not finish before the time limit.", 504)
    if isinstance(error, httpx.TransportError):
        return Failure(
            "network_error", "Atlas could not reach an external service. Try again later.", 503
        )
    return Failure("internal_error", "Something went wrong on our end.", 500)


def report(log: logging.Logger, error: Exception, code: str, *, tool: str = "-") -> None:
    # Traceback strings and SQL/provider exception messages can contain private content.
    # Keep the exception type and stack locations, never values, locals, or source lines.
    frames = [
        f"{f.filename}:{f.lineno}:{f.name}" for f in traceback.extract_tb(error.__traceback__)
    ]
    log.error(
        "failure code=%s request_id=%s turn_id=%s tool=%s type=%s frames=%s",
        code,
        request_id.get(),
        turn_id.get(),
        tool,
        type(error).__name__,
        frames,
    )
