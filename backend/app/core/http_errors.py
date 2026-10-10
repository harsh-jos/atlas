"""One HTTP error contract and request reference, including failures outside route handlers."""

import logging
from uuid import uuid4

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.core.errors import describe, report, request_id

log = logging.getLogger(__name__)


def response(status: int, detail: str, code: str, **extra) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"detail": detail, "code": code, "requestId": request_id.get(), **extra},
    )


class ErrorMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        reference = str(uuid4())
        token = request_id.set(reference)
        started = False

        async def tracked_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                message["headers"] = [
                    *message.get("headers", []),
                    (b"x-request-id", reference.encode()),
                ]
            await send(message)

        try:
            await self.app(scope, receive, tracked_send)
        except Exception as error:
            failure = describe(error)
            report(log, error, failure.code)
            if started:
                # Do not let the server print the original exception (or its private values).
                raise RuntimeError(
                    "Atlas response interrupted; see its request reference"
                ) from None
            await response(failure.status, failure.message, failure.code)(
                scope, receive, tracked_send
            )
        finally:
            request_id.reset(token)


async def http_error(request, error: HTTPException):
    codes = {
        400: "invalid_request",
        401: "not_authenticated",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        413: "too_large",
        415: "unsupported_type",
        429: "rate_limited",
        503: "unavailable",
    }
    result = response(error.status_code, error.detail, codes.get(error.status_code, "http_error"))
    result.headers.update(error.headers or {})
    return result


async def validation_error(request, error: RequestValidationError):
    fields = [
        {"field": ".".join(map(str, item["loc"])), "code": item["type"]} for item in error.errors()
    ]
    return response(
        422, "Some fields are invalid. Check your input.", "validation_error", fields=fields
    )
