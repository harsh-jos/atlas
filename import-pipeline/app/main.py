import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.imports import router as imports_router
from app.config import get_settings
from app.db import repository
from app.db.pool import close_pool, get_pool
from app.queue import JobStore, run_worker
from app.runner import process_job

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    with get_pool().connection() as conn:  # warm the pool + ensure our index exists
        repository.ensure_indexes(conn)

    store = JobStore(settings.jobs_db_path)
    app.state.store = store

    stop = asyncio.Event()
    worker = asyncio.create_task(run_worker(store, process_job, stop))
    try:
        yield
    finally:
        stop.set()
        await worker
        close_pool()


app = FastAPI(title="Atlas Import Pipeline", version="0.1.0", lifespan=lifespan)
app.include_router(imports_router)


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    """Liveness + database reachability."""
    with get_pool().connection() as conn:
        conn.execute("SELECT 1")
    return {"ok": True}
