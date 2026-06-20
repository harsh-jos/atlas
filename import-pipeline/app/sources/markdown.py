"""Markdown source adapter: raw .md text/file -> StructuredDocument."""

from __future__ import annotations

from pathlib import Path

from app.models import SourceType
from app.parsing.markdown_parser import parse_markdown
from app.slugify import slugify
from app.sources.base import SourceResult


def from_markdown_text(
    text: str,
    *,
    title: str,
    source_type: SourceType = SourceType.DOCS,
    source_url: str | None = None,
    scope: str | None = None,
) -> SourceResult:
    doc = parse_markdown(
        text, fallback_title=title, source_type=source_type, source_url=source_url
    )
    return SourceResult(
        doc=doc,
        scope=scope or source_url or f"md:{slugify(title)}",
        suggested_collection=doc.meta.title,
    )


def from_markdown_file(
    path: str | Path,
    *,
    title: str | None = None,
    source_type: SourceType = SourceType.DOCS,
) -> SourceResult:
    file = Path(path)
    name = title or file.stem
    return from_markdown_text(
        file.read_text(encoding="utf-8"),
        title=name,
        source_type=source_type,
        scope=f"md:{slugify(name)}",
    )
