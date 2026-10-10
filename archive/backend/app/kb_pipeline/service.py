"""One KB build, end to end: crawl -> extract -> triage -> outline -> compose -> write.

Synchronous by design (network + LLM bound); the API layer runs it in a worker
thread. Everything the build learns goes through `log`, so the job's progress
is the user's window into a run that takes minutes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlparse
from uuid import UUID

from app.core.config import get_settings
from app.db.base import SessionScope
from app.db.models import User
from app.kb_pipeline import extract, fetch
from app.kb_pipeline.compose import compose_articles
from app.kb_pipeline.mapper import build_mapped_import
from app.kb_pipeline.models import Page
from app.kb_pipeline.outline import build_outline
from app.kb_pipeline.triage import triage_pages
from app.llm import create_llm
from app.pipeline.writer import ImportSummary, ImportWriter
from app.storage.quota import QuotaService

Log = Callable[[str], None]


@dataclass(frozen=True)
class KbBuildRequest:
    url: str
    goal: str | None = None
    provider: str | None = None
    model: str | None = None
    max_pages: int | None = None
    max_articles: int | None = None


@dataclass(frozen=True)
class KbBuildResult:
    summary: ImportSummary
    goal: str
    provider: str
    model: str
    usage: dict[str, int]


def run_kb_build(
    request: KbBuildRequest, user_id: UUID, session_scope: SessionScope, log: Log
) -> KbBuildResult:
    settings = get_settings()
    llm = create_llm(request.provider, request.model)
    log(f"provider: {llm.provider} ({llm.model})")

    pages = _crawl(request, log)
    if not pages:
        raise RuntimeError("no usable pages found at that URL")

    goal = request.goal or _default_goal(request.url, pages)
    log(f"goal: {goal}")

    log("triage: judging every page against the goal")
    triaged = triage_pages(pages, goal, llm,
                           keep_threshold=settings.kb_keep_threshold, log=log)
    if not any(t.kept for t in triaged):
        raise RuntimeError("triage kept no pages — try a more specific URL or goal")

    log("outline: designing the learning map")
    max_articles = request.max_articles or settings.kb_max_articles
    plan = build_outline(triaged, goal, max_articles, llm, log=log)
    if not plan.articles:
        raise RuntimeError("the outline produced no articles")

    log("compose: writing articles")
    pages_by_url = {t.page.url: t.page for t in triaged if t.kept}
    articles = compose_articles(plan, pages_by_url, goal, llm, log=log)

    log("write: persisting into your library")
    mapped = build_mapped_import(
        plan=plan, articles=articles, triaged=triaged, goal=goal,
        seed_url=request.url, provider=llm.provider, model=llm.model,
    )
    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None:
            raise RuntimeError("user vanished mid-build")
        summary = ImportWriter(session, user, QuotaService(session, user)).write(mapped)

    log(f"done: {summary['artifacts']} artifacts in '{summary['conceptSlug']}' "
        f"({llm.usage['input_tokens']:,} tokens in / {llm.usage['output_tokens']:,} out)")
    return KbBuildResult(
        summary=summary, goal=goal, provider=llm.provider, model=llm.model, usage=llm.usage
    )


def _crawl(request: KbBuildRequest, log: Log) -> list[Page]:
    settings = get_settings()
    log(f"crawl: {request.url}")
    fetcher = fetch.Fetcher(delay=settings.kb_crawl_delay)
    robots = fetch.Robots(fetcher.get_text)
    try:
        crawl = fetch.crawl_site(
            request.url, fetcher=fetcher, robots=robots,
            max_pages=request.max_pages or settings.kb_max_pages, log=log,
        )
    finally:
        fetcher.close()

    pages: list[Page] = []
    empty = 0
    for url, html in crawl.pages:
        page = extract.extract_page(url, html)
        if page is None:
            empty += 1
        else:
            pages.append(page)
    pages, dupes = extract.dedupe_pages(pages)
    log(f"crawl: {len(pages)} pages with content "
        f"({empty} stubs, {dupes} duplicates, {crawl.skipped_robots} robots-blocked)")
    return pages


def _default_goal(url: str, pages: list[Page]) -> str:
    topic = pages[0].title if pages else urlparse(url).netloc
    return f"Understand {topic} well enough to build with it confidently"
