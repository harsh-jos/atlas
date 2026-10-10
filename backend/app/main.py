import logging
import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from sqlalchemy import text

from app.agent.router import router as agent_router
from app.agent.worker import WorkerHealth, run_worker
from app.api.assets import router as assets_router
from app.api.library import router as library_router
from app.api.writes import router as writes_router
from app.auth.router import router as auth_router
from app.db.base import get_engine
from app.core.errors import AppError
from app.core.http_errors import ErrorMiddleware, http_error, validation_error

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.worker_health = WorkerHealth()
    worker = asyncio.create_task(run_worker(app.state.worker_health))
    app.state.worker = worker
    try:
        yield
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker
        get_engine().dispose()


app = FastAPI(title="Atlas", version="0.1.0", lifespan=lifespan)
app.add_middleware(ErrorMiddleware)
app.add_exception_handler(HTTPException, http_error)
app.add_exception_handler(RequestValidationError, validation_error)


app.include_router(auth_router)
app.include_router(agent_router)
app.include_router(library_router)
app.include_router(writes_router)
app.include_router(assets_router)


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    """Readiness: a reachable database and a worker recently able to access its queue."""
    worker = getattr(app.state, "worker", None)
    health = getattr(app.state, "worker_health", None)
    if worker is None or worker.done() or health is None or not health.ready():
        raise AppError("The chat worker is unavailable. Try again later.", "worker_unavailable", 503)
    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True}


@app.get("/livez")
def livez() -> dict[str, bool]:
    return {"ok": True}
