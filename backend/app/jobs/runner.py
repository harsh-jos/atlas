"""Turns a queued job into a written import: load source -> build -> write, with progress.

`process_job` is the JobProcessor handed to the worker. It is synchronous (runs in a worker
thread), reports progress through the JobStore, and cleans up any uploaded file afterwards.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.auth.repository import UserRepository
from app.db.base import get_session_factory
from app.pipeline.enrich_llm import enricher_from_settings
from app.pipeline.models import SourceType
from app.pipeline.obsidian import write_vault
from app.pipeline.build import build_import
from app.pipeline.sources import article, markdown, pdf, website
from app.pipeline.sources.base import SourceResult
from app.pipeline.writer import ImportSummary, ImportWriter
from app.storage.quota import QuotaService

log = logging.getLogger(__name__)

ProgressFn = Callable[[dict[str, Any]], None]

_DEFAULT_SOURCE_TYPE = {
    "url": SourceType.DOCS,
    "article": SourceType.WEBSITE,
    "markdown": SourceType.DOCS,
    "markdown_file": SourceType.DOCS,
    "pdf": SourceType.BOOK,
}


def _source_type(params: dict[str, Any], default: SourceType) -> SourceType:
    raw = params.get("sourceType")
    if raw:
        try:
            return SourceType(str(raw).upper())
        except ValueError:
            log.warning("unknown sourceType %r; using %s", raw, default)
    return default


def load_source(kind: str, params: dict[str, Any]) -> SourceResult:
    source_type = _source_type(params, _DEFAULT_SOURCE_TYPE.get(kind, SourceType.DOCS))
    if kind == "url":
        return website.from_website(params["url"], source_type=source_type)
    if kind == "article":
        return article.from_article_url(params["url"], source_type=source_type)
    if kind == "markdown":
        return markdown.from_markdown_text(
            params["text"], title=params.get("title") or "Untitled", source_type=source_type
        )
    if kind == "markdown_file":
        return markdown.from_markdown_file(
            params["path"], title=params.get("title"), source_type=source_type
        )
    if kind == "pdf":
        data = Path(params["path"]).read_bytes()
        return pdf.from_pdf_bytes(data, filename=params["filename"], source_type=source_type)
    raise ValueError(f"unknown import kind: {kind!r}")


def run_import(kind: str, params: dict[str, Any], on_progress: ProgressFn) -> ImportSummary:
    settings = get_settings()

    on_progress({"stage": "loading"})
    source = load_source(kind, params)

    on_progress({"stage": "segmenting"})
    mapped = build_import(
        source.doc,
        concept_name=params.get("conceptName") or source.suggested_concept,
        scope=source.scope,
        min_artifact_chars=settings.min_artifact_chars,
        max_split_level=settings.max_split_level,
        enricher=enricher_from_settings(settings),
        concept_color=params.get("color"),
    )

    on_progress({"stage": "writing", "artifacts": len(mapped.artifacts)})
    with get_session_factory().begin() as session:
        user = UserRepository(session).get(UUID(params["userId"]))
        if user is None:
            raise ValueError(f"import owner {params['userId']} no longer exists")
        summary = ImportWriter(session, user, QuotaService(session, user)).write(mapped)

    if settings.obsidian_vault_dir:
        vault = write_vault(mapped, settings.obsidian_vault_dir)
        log.info("mirrored import to Obsidian vault: %s (%d notes)", vault["folder"], vault["entries"])

    on_progress({"stage": "done", **summary})
    return summary


def process_job(store: Any, job: dict[str, Any]) -> dict[str, Any]:
    job_id = job["id"]
    kind = job["kind"]
    params = json.loads(job["params"])
    try:
        return dict(run_import(kind, params, lambda p: store.set_progress(job_id, p)))
    finally:
        upload = params.get("path")
        if upload and get_settings().uploads_dir in upload:
            try:
                os.unlink(upload)
            except OSError:
                pass
