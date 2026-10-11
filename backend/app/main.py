import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from sqlalchemy import text

from app.agent.session import get_session_service
from app.db.bootstrap import prepare_database
from app.agent.router import router as agent_router
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
    app.state.schema_ready = False
    try:
        await prepare_database()
        app.state.schema_ready = True
        yield
    finally:
        app.state.schema_ready = False
        try:
            if get_session_service.cache_info().currsize:
                await get_session_service().close()
                get_session_service.cache_clear()
        finally:
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
    """Readiness: schema validation and a reachable database."""
    if not getattr(app.state, "schema_ready", False):
        raise AppError("Database setup is incomplete.", "schema_unavailable", 503)
    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True}


@app.get("/livez")
def livez() -> dict[str, bool]:
    return {"ok": True}
