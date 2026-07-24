import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.agent.router import router as agent_router
from app.api.imports import router as imports_router
from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.db.base import get_engine
from app.jobs.queue import JobStore, run_worker
from app.jobs.runner import process_job
from app.realtime.router import router as realtime_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = JobStore(get_settings().jobs_db_path)
    app.state.store = store

    stop = asyncio.Event()
    worker = asyncio.create_task(run_worker(store, process_job, stop))
    try:
        yield
    finally:
        stop.set()
        await worker
        get_engine().dispose()


app = FastAPI(title="Atlas", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(realtime_router)
app.include_router(agent_router)
app.include_router(imports_router)


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    """Liveness plus database reachability."""
    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True}
