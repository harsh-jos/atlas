"""Article source adapter: a single web page -> StructuredDocument (via trafilatura)."""

from __future__ import annotations

import logging
import re

import trafilatura

from app.pipeline.models import SourceType
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.sources.base import SourceFetchError, SourceResult

log = logging.getLogger(__name__)

# Headings are what the segmenter splits on, so losing them silently collapses a whole page
# into one artifact. Only h2-h4 count: an h1 is the page title, not a section boundary.
_HTML_HEADING = re.compile(r"<h[2-4][\s>]", re.IGNORECASE)
_MARKDOWN_HEADING = re.compile(r"^#{1,6}\s", re.MULTILINE)


def _extract(html: str, url: str, **options: bool) -> str | None:
    return trafilatura.extract(
        html,
        url=url,
        output_format="markdown",
        include_links=True,
        include_tables=True,
        **options,
    )


def extract_markdown(html: str, url: str) -> str | None:
    """Main-content extraction to markdown, preserving the headings the segmenter needs.

    `fast=True` avoids the fallback extractor that can duplicate content on thin pages. But
    trafilatura only keeps headings when the content sits in a semantic container (`<article>`
    or `<main>`); on hand-rolled pages it flattens them, and the page would import as a single
    artifact with nothing to curate. Retry once favouring recall, then say so if still lost.
    """
    markdown = _extract(html, url, fast=True)
    if not markdown or not _HTML_HEADING.search(html) or _MARKDOWN_HEADING.search(markdown):
        return markdown

    recovered = _extract(html, url, favor_recall=True)
    if recovered and _MARKDOWN_HEADING.search(recovered):
        return recovered

    log.warning(
        "%s has headings but extraction flattened them; importing as a single artifact", url
    )
    return markdown


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

    return SourceResult(doc=doc, scope=url, suggested_concept=doc.meta.title)
