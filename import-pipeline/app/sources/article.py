"""Article source adapter: a single web page -> StructuredDocument (via trafilatura)."""

from __future__ import annotations

import trafilatura

from app.models import SourceType
from app.parsing.markdown_parser import parse_markdown
from app.sources.base import SourceFetchError, SourceResult


def extract_markdown(html: str, url: str) -> str | None:
    """Main-content extraction to markdown. `fast=True` avoids the fallback extractor that
    can otherwise duplicate content on thin pages."""
    return trafilatura.extract(
        html,
        url=url,
        output_format="markdown",
        include_links=True,
        include_tables=True,
        fast=True,
    )


def from_article_url(url: str, *, source_type: SourceType = SourceType.WEBSITE) -> SourceResult:
    html = trafilatura.fetch_url(url)
    if not html:
        raise SourceFetchError(f"Could not fetch {url}")

    markdown = extract_markdown(html, url)
    if not markdown or not markdown.strip():
        raise SourceFetchError(f"No article content extracted from {url}")

    meta = trafilatura.extract_metadata(html, default_url=url)
    title = (getattr(meta, "title", None) if meta else None) or url

    doc = parse_markdown(markdown, fallback_title=title, source_type=source_type, source_url=url)
    if meta is not None:
        author = getattr(meta, "author", None)
        if author:
            doc.meta.authors = [author]
        date = getattr(meta, "date", None)
        if date:
            doc.meta.published_at = str(date)

    return SourceResult(doc=doc, scope=url, suggested_collection=doc.meta.title)
