"""Knowledge-base builds and the LLM provider roster."""

import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.deps import CurrentUser, SessionDep
from app.core.config import get_settings
from app.db.base import get_session_scope
from app.kb_pipeline.jobs import kb_job_store
from app.kb_pipeline.service import KbBuildRequest, run_kb_build
from app.llm import ProviderNotConfigured, UnknownProvider, available_providers, create_llm

llm_router = APIRouter(prefix="/llm", tags=["llm"])
kb_router = APIRouter(prefix="/kb", tags=["kb"])


class ProviderOut(BaseModel):
    id: str
    label: str
    configured: bool
    defaultModel: str
    isDefault: bool


@llm_router.get("/providers", response_model=list[ProviderOut])
def list_providers(user: CurrentUser) -> list[ProviderOut]:
    default = get_settings().llm_provider
    return [
        ProviderOut(
            id=p.id, label=p.label, configured=p.configured,
            defaultModel=p.default_model, isDefault=p.id == default,
        )
        for p in available_providers()
    ]


class BuildRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    goal: str | None = Field(default=None, max_length=500)
    provider: str | None = None
    model: str | None = Field(default=None, max_length=200)
    maxPages: int | None = Field(default=None, ge=5, le=500)
    maxArticles: int | None = Field(default=None, ge=3, le=25)


class BuildStarted(BaseModel):
    id: UUID


class BuildStatus(BaseModel):
    id: UUID
    url: str
    status: str
    log: list[str]
    conceptSlug: str | None
    error: str | None


@kb_router.post("/builds", response_model=BuildStarted, status_code=status.HTTP_202_ACCEPTED)
async def start_build(request: BuildRequest, session: SessionDep, user: CurrentUser) -> BuildStarted:
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "url must be http(s)")
    try:
        create_llm(request.provider, request.model)  # fail here, not mid-build
    except (UnknownProvider, ProviderNotConfigured) as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    store = kb_job_store()
    job = store.create(user.id, request.url)
    build = KbBuildRequest(
        url=request.url, goal=request.goal, provider=request.provider,
        model=request.model, max_pages=request.maxPages, max_articles=request.maxArticles,
    )

    def work() -> None:
        try:
            result = run_kb_build(
                build, job.user_id, get_session_scope(),
                log=lambda line: store.append(job.id, line),
            )
            store.finish(job.id, concept_slug=result.summary["conceptSlug"])
        except Exception as error:  # surfaced to the poller, not swallowed
            store.append(job.id, f"failed: {error}")
            store.finish(job.id, error=str(error))

    task = asyncio.create_task(asyncio.to_thread(work))
    _BACKGROUND.add(task)
    task.add_done_callback(_BACKGROUND.discard)
    return BuildStarted(id=job.id)


@kb_router.get("/builds/{job_id}", response_model=BuildStatus)
def build_status(job_id: UUID, user: CurrentUser) -> BuildStatus:
    job = kb_job_store().get(job_id, user.id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "build not found")
    return BuildStatus(
        id=job.id, url=job.url, status=job.status, log=list(job.log),
        conceptSlug=job.concept_slug, error=job.error,
    )


_BACKGROUND: set[asyncio.Task] = set()
