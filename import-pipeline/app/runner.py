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

from app.config import get_settings
from app.db.pool import get_pool
from app.models import SourceType
from app.pipeline import build_import
from app.sources import article, markdown, pdf, website
from app.sources.base import SourceResult
from app.writer import write_import

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


def run_import(kind: str, params: dict[str, Any], on_progress: ProgressFn) -> dict[str, Any]:
    settings = get_settings()

    on_progress({"stage": "loading"})
    source = load_source(kind, params)

    # Surface which strategy actually loaded the source, so a degraded fall-back is visible in
    # the job instead of looking like a clean success (fail loud, never silent).
    report = source.report.as_dict() if source.report else None
    on_progress({"stage": "segmenting", "source": report})
    mapped = build_import(
        source.doc,
        collection_name=params.get("collectionName") or source.suggested_collection,
        scope=source.scope,
        min_entry_chars=settings.min_entry_chars,
        max_entry_chars=settings.max_entry_chars,
        collection_color=params.get("color"),
    )

    on_progress({"stage": "writing", "entries": len(mapped.entries)})
    with get_pool().connection() as conn:
        summary = write_import(conn, mapped)

    result: dict[str, Any] = {**summary, "source": report}
    on_progress({"stage": "done", **result})
    return result


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
