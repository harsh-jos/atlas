"""Turns an import request into a parsed source: the one place adapters are chosen."""

import logging
from pathlib import Path
from typing import Any

from app.pipeline.models import SourceType
from app.pipeline.sources import article, markdown, pdf, website
from app.pipeline.sources.base import SourceResult

log = logging.getLogger(__name__)

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
