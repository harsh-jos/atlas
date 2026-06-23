"""Docs-site fetch strategies, tried richest-first. Each is one self-contained way to turn a
site URL into a `StructuredDocument`; the orchestrator (`website.py`) runs them in order and
takes the first that succeeds. Adding a new way to fetch a site is a new strategy here, not an
edit to the orchestrator (open/closed).

Every strategy returns a `SourceResult` carrying an `ImportReport`, so the path actually taken
— and anything it had to skip — is visible downstream instead of silently swallowed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol
from xml.etree import ElementTree

from app.models import DocMeta, Section, SourceType, StructuredDocument
from app.parsing.markdown_detect import is_markdown_document, strip_llm_preamble
from app.parsing.markdown_parser import parse_markdown
from app.slugify import slugify
from app.sources import article, locations
from app.sources.base import ImportReport, SourceFetchError, SourceResult
from app.sources.http import get_ok

log = logging.getLogger(__name__)

_MAX_PAGES = 200
_MAX_INDEX_SITEMAPS = 20


@dataclass(slots=True)
class FetchContext:
    url: str
    source_type: SourceType


class FetchStrategy(Protocol):
    name: str

    def attempt(self, ctx: FetchContext) -> SourceResult | None:
        """Return a SourceResult if this strategy applies to the site, else None."""
        ...


# --- Tier 1: llms-full.txt / llms.txt (one request, lossless) ------------------------------


class LlmsTextStrategy:
    name = "llms-text"

    def attempt(self, ctx: FetchContext) -> SourceResult | None:
        host = locations.host(ctx.url)
        for candidate in locations.llms_candidates(ctx.url):
            response = get_ok(candidate)
            if response is None or not is_markdown_document(response.text):
                continue
            kind = "llms-full" if candidate.endswith("llms-full.txt") else "llms-index"
            log.info("using %s for %s", candidate, host)
            doc = parse_markdown(
                strip_llm_preamble(response.text),
                fallback_title=host,
                source_type=ctx.source_type,
                source_url=locations.domain_base(ctx.url),
            )
            report = ImportReport(strategy_used=kind, detail=candidate)
            return SourceResult(doc, scope=host, suggested_collection=doc.meta.title or host,
                                report=report)
        return None


# --- Tier 2: sitemap.xml (enumerate pages, extract each, graft into one tree) ---------------


def _loc_texts(xml: bytes) -> tuple[bool, list[str]]:
    """(is_sitemap_index, loc urls) from a sitemap or sitemap-index document."""
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return False, []
    is_index = root.tag.split("}")[-1] == "sitemapindex"
    locs = [el.text.strip() for el in root.iter()
            if el.tag.split("}")[-1] == "loc" and el.text]
    return is_index, locs


def _collect_locs(xml: bytes) -> list[str]:
    """All page URLs from a sitemap, following one level of sitemap-index nesting."""
    is_index, locs = _loc_texts(xml)
    if not is_index:
        return locs
    pages: list[str] = []
    for sitemap_url in locs[:_MAX_INDEX_SITEMAPS]:
        child = get_ok(sitemap_url)
        if child is not None:
            pages.extend(_loc_texts(child.content)[1])
        if len(pages) >= _MAX_PAGES:
            break
    return pages


def _relevel(section: Section, level: int) -> None:
    delta = level - section.level

    def shift(node: Section) -> None:
        node.level += delta
        for child in node.children:
            shift(child)

    shift(section)


class SitemapStrategy:
    name = "sitemap"

    def attempt(self, ctx: FetchContext) -> SourceResult | None:
        host = locations.host(ctx.url)
        response = next(
            (r for c in locations.sitemap_candidates(ctx.url) if (r := get_ok(c)) is not None),
            None,
        )
        if response is None:
            return None

        all_locs = _collect_locs(response.content)
        # Filter against the host the sitemap was actually served from (post-redirect), and
        # adopt a single canonical foreign host if that's what it lists — see select_pages.
        served_from = str(response.url)
        pages, off_site = locations.select_pages(all_locs, served_from)
        capped = max(0, len(pages) - _MAX_PAGES)
        if capped:
            log.warning("sitemap for %s has %d pages; capping at %d", host, len(pages), _MAX_PAGES)
            pages = pages[:_MAX_PAGES]
        if not pages:
            return None

        site = Section(title=host, level=0, anchor=slugify(host))
        fetched = 0
        for url in pages:
            try:
                page = article.from_article_url(url, source_type=ctx.source_type)
            except SourceFetchError as error:
                log.warning("skipping %s: %s", url, error)
                continue
            page_root = page.doc.root
            page_root.title = page.doc.meta.title
            page_root.source_url = url  # per-page provenance + cross-page link resolution
            _relevel(page_root, 1)
            site.children.append(page_root)
            fetched += 1

        if not site.children:
            return None

        notes = []
        if off_site:
            notes.append(f"{off_site} sitemap URLs on another domain ignored")
        if capped:
            notes.append(f"{capped} pages over the {_MAX_PAGES}-page cap dropped")
        report = ImportReport(
            strategy_used=self.name,
            detail=f"crawled {fetched}/{len(pages)} pages",
            pages_found=len(pages),
            pages_fetched=fetched,
            pages_skipped=len(pages) - fetched,
            notes=notes,
        )
        meta = DocMeta(title=host, source_type=ctx.source_type,
                       source_url=locations.domain_base(ctx.url))
        doc = StructuredDocument(meta=meta, root=site)
        return SourceResult(doc, scope=host, suggested_collection=host, report=report)


# --- Tier 3: single page (last resort) -----------------------------------------------------


class SinglePageStrategy:
    name = "single-page"

    def attempt(self, ctx: FetchContext) -> SourceResult | None:
        log.warning("no llms.txt or sitemap for %s; importing as a single article",
                    locations.host(ctx.url))
        result = article.from_article_url(ctx.url, source_type=ctx.source_type)
        result.report = ImportReport(strategy_used=self.name, detail=ctx.url)
        return result


def default_strategies() -> list[FetchStrategy]:
    """The fetch strategies in priority order — richest source first."""
    return [LlmsTextStrategy(), SitemapStrategy(), SinglePageStrategy()]
