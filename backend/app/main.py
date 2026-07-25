import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.agent.router import router as agent_router
from app.api.assets import router as assets_router
from app.api.imports import router as imports_router
from app.api.library import router as library_router
from app.api.links import router as links_router
from app.api.previews import router as previews_router
from app.api.writes import router as writes_router
from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.db.base import get_engine, get_session_scope
from app.jobs.queue import JobStore, run_worker
from app.jobs.runner import process_job
from app.jobs.sweeper import run_sweeper
from app.realtime.router import router as realtime_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = JobStore(get_settings().jobs_db_path)
    app.state.store = store

    stop = asyncio.Event()
    background = [
        asyncio.create_task(run_worker(store, process_job, stop)),
        asyncio.create_task(run_sweeper(get_session_scope(), stop)),
    ]
    try:
        yield
    finally:
        stop.set()
        await asyncio.gather(*background)
        get_engine().dispose()


app = FastAPI(title="Atlas", version="0.1.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """A bug must not leak a traceback to the reader. The trace goes to the log; a plain, honest
    message goes to the caller — deliberate HTTPExceptions keep their own specific detail."""
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our end."})


app.include_router(auth_router)
app.include_router(realtime_router)
app.include_router(agent_router)
app.include_router(library_router)
app.include_router(writes_router)
app.include_router(previews_router)
app.include_router(links_router)
app.include_router(assets_router)
app.include_router(imports_router)


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    """Liveness plus database reachability."""
    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True}
