"""HTML -> clean markdown with per-page provenance. Deterministic."""
from __future__ import annotations

import re
from datetime import datetime, timezone

import trafilatura

from app.kb_pipeline.models import Page
from app.kb_pipeline.structure import headings_of, word_count_of

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
# common "Title — Site Name" / "Title | Site" suffixes
_TITLE_SUFFIX_RE = re.compile(r"\s*[|—–-]\s*[^|—–-]{0,60}$")

MIN_PAGE_CHARS = 300  # shorter than this is a stub/redirect page, not content


def page_title(html: str, fallback: str) -> str:
    m = _TITLE_RE.search(html)
    if not m:
        return fallback
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    if len(title) > 40:
        title = _TITLE_SUFFIX_RE.sub("", title)
    return title or fallback


def html_to_markdown(html: str, url: str) -> str | None:
    """Precision-first extraction. Atlas's old pipeline retried with
    favor_recall, which is exactly what pulled nav bars and sidebars into the
    corpus — here the fallback is a plain extract, never a recall-biased one."""
    md = trafilatura.extract(
        html, url=url, output_format="markdown",
        include_links=True, include_tables=True, favor_precision=True,
    )
    if md is None:
        md = trafilatura.extract(html, url=url, output_format="markdown",
                                 include_links=True, include_tables=True)
    return md


def extract_page(url: str, html: str, canonical: str | None = None) -> Page | None:
    """Build a Page or return None when the page has no usable prose."""
    markdown = html_to_markdown(html, url)
    if markdown is None or len(markdown.strip()) < MIN_PAGE_CHARS:
        return None
    return Page(
        url=url,
        title=page_title(html, fallback=url),
        markdown=markdown,
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        canonical=canonical,
        headings=headings_of(markdown),
        word_count=word_count_of(markdown),
    )


def dedupe_pages(pages: list[Page]) -> tuple[list[Page], int]:
    """Drop pages whose extracted content is byte-identical to an earlier one
    (mirrors, trailing-slash twins that canonical collapse missed)."""
    seen: set[str] = set()
    unique: list[Page] = []
    dropped = 0
    for page in pages:
        h = page.content_hash
        if h in seen:
            dropped += 1
            continue
        seen.add(h)
        unique.append(page)
    return unique, dropped
