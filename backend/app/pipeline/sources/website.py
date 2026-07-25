"""Website / documentation source adapter, tiered cheapest-first:

  1. /llms-full.txt or /llms.txt  — whole docs as one markdown file (one request, lossless).
  2. /sitemap.xml                 — enumerate pages, extract each, graft into one tree.
  3. BFS crawl                    — follow same-prefix links from the start page.
  4. single page                 — fall back to the article adapter.

Discovery is *path-aware*: docs are commonly hosted on a subpath (``google.github.io/adk-docs/``,
``docs.site.com/v2/``), so we probe llms/sitemap files at every path ancestor of the given URL
*and* the domain root — not just the root, which is where the previous version silently lost
subpath-hosted docs and fell back to importing a single landing page.

Everything still funnels through `parse_markdown`, so segmentation is unchanged.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

import httpx

from app.pipeline.models import DocMeta, Section, SourceType, StructuredDocument
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.core.slugify import slugify
from app.pipeline.sources import article
from app.pipeline.sources.base import SourceFetchError, SourceResult
from app.pipeline.sources.crawl import crawl_pages

log = logging.getLogger(__name__)

_MAX_PAGES = 400
_FETCH_WORKERS = 8
_TIMEOUT = httpx.Timeout(30.0)
_HEADERS = {"User-Agent": "AtlasImportPipeline/0.1 (+local)"}
_HEADING = "# "


def _host(url: str) -> str:
    return urlparse(url if "://" in url else f"https://{url}").netloc or url


def _base(url: str) -> str:
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return f"{parsed.scheme}://{parsed.netloc}/"


def _prefixes(url: str) -> list[str]:
    """Candidate base URLs to probe for llms/sitemap files, most-specific first.

    For ``https://google.github.io/adk-docs/get-started/`` this yields the directory and each
    of its ancestors down to the domain root, so a docs site hosted on a subpath is found
    wherever it keeps its llms.txt / sitemap.xml.
    """
    parsed = urlparse(url if "://" in url else f"https://{url}")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    segments = [seg for seg in parsed.path.split("/") if seg]
    # Drop a trailing file segment (has a dot) so we probe its directory, not the file.
    if segments and "." in segments[-1]:
        segments.pop()

    prefixes: list[str] = []
    while segments:
        prefixes.append(f"{origin}/{'/'.join(segments)}/")
        segments.pop()
    prefixes.append(f"{origin}/")
    return prefixes


def _get(url: str) -> httpx.Response | None:
    try:
        response = httpx.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
    except httpx.HTTPError as error:
        log.warning("fetch failed %s: %s", url, error)
        return None
    return response if response.status_code == 200 else None


def _looks_like_markdown(text: str) -> bool:
    stripped = text.lstrip()
    if stripped.startswith("<"):  # an HTML error/landing page, not markdown
        return False
    return "#" in text or len(stripped) > 500


def _doc_title(text: str, fallback: str) -> str:
    """First top-level ATX heading of an llms.txt file, else the fallback (host)."""
    for line in text.splitlines():
        if line.startswith(_HEADING):
            return line[len(_HEADING):].strip() or fallback
        if line.strip():  # first non-heading content line: give up, use fallback
            break
    return fallback


def _locs(xml: bytes) -> list[str]:
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return []
    is_index = root.tag.split("}")[-1] == "sitemapindex"
    found = [
        el.text.strip()
        for el in root.iter()
        if el.tag.split("}")[-1] == "loc" and el.text
    ]
    if not is_index:
        return found

    urls: list[str] = []
    for sitemap_url in found[:20]:
        child = _get(sitemap_url)
        if child is not None:
            urls.extend(
                el.text.strip()
                for el in ElementTree.fromstring(child.content).iter()
                if el.tag.split("}")[-1] == "loc" and el.text
            )
        if len(urls) >= _MAX_PAGES:
            break
    return urls


def _sitemap_urls(prefix: str) -> list[str]:
    """Pages listed in the sitemap at `prefix`, restricted to URLs under that prefix."""
    response = _get(urljoin(prefix, "sitemap.xml"))
    if response is None:
        return []
    pages = [url for url in _locs(response.content) if url.startswith(prefix)]
    # De-duplicate while preserving sitemap order.
    seen: set[str] = set()
    unique = [u for u in pages if not (u in seen or seen.add(u))]
    if len(unique) > _MAX_PAGES:
        log.warning(
            "sitemap under %s has %d pages; importing the first %d",
            prefix, len(unique), _MAX_PAGES,
        )
        unique = unique[:_MAX_PAGES]
    return unique


def _relevel(section: Section, level: int) -> None:
    delta = level - section.level

    def shift(node: Section) -> None:
        node.level += delta
        for child in node.children:
            shift(child)

    shift(section)


def _fetch_page(url: str, source_type: SourceType) -> Section | None:
    """Extract one page into a section rooted at level 1, or None if it yields nothing."""
    try:
        page = article.from_article_url(url, source_type=source_type)
    except SourceFetchError as error:
        log.warning("skipping %s: %s", url, error)
        return None
    page_root = page.doc.root
    page_root.title = page.doc.meta.title
    _relevel(page_root, 1)
    return page_root


def _tree_from_pages(
    title: str, base: str, urls: list[str], source_type: SourceType
) -> StructuredDocument:
    """Fetch pages concurrently and graft each under one site root, preserving input order."""
    site = Section(title=title, level=0, anchor=slugify(title))
    with ThreadPoolExecutor(max_workers=_FETCH_WORKERS) as pool:
        sections = list(pool.map(lambda u: _fetch_page(u, source_type), urls))
    site.children = [section for section in sections if section is not None]

    if not site.children:
        raise SourceFetchError(f"{base} yielded no readable pages")

    log.info("extracted %d/%d pages from %s", len(site.children), len(urls), base)
    meta = DocMeta(title=title, source_type=source_type, source_url=base)
    return StructuredDocument(meta=meta, root=site)


def from_website(url: str, *, source_type: SourceType = SourceType.DOCS) -> SourceResult:
    prefixes = _prefixes(url)
    host = _host(url)
    focus = prefixes[0]  # most specific prefix the caller pointed us at

    # Tier 1: llms-full.txt / llms.txt, probed at every path ancestor then the root.
    for prefix in prefixes:
        for name in ("llms-full.txt", "llms.txt"):
            response = _get(urljoin(prefix, name))
            if response is not None and _looks_like_markdown(response.text):
                log.info("using %s%s", prefix, name)
                title = _doc_title(response.text, host)
                doc = parse_markdown(
                    response.text, fallback_title=title, source_type=source_type,
                    source_url=prefix,
                )
                return SourceResult(doc=doc, scope=prefix, suggested_concept=doc.meta.title)

    # Tier 2: sitemap.xml, probed at every ancestor; keep pages under the caller's focus prefix.
    for prefix in prefixes:
        pages = [u for u in _sitemap_urls(prefix) if u.startswith(focus)]
        if pages:
            log.info("crawling %d pages from %ssitemap.xml", len(pages), prefix)
            doc = _tree_from_pages(host, focus, pages, source_type)
            return SourceResult(doc=doc, scope=focus, suggested_concept=host)

    # Tier 3: BFS crawl under the focus prefix (docs sites with neither llms.txt nor a sitemap).
    crawled = crawl_pages(url, prefix=focus, max_pages=_MAX_PAGES)
    if len(crawled) > 1:
        log.info("crawled %d pages under %s", len(crawled), focus)
        doc = _tree_from_pages(host, focus, crawled, source_type)
        return SourceResult(doc=doc, scope=focus, suggested_concept=host)

    # Tier 4: single page.
    log.warning("no llms.txt, sitemap, or crawlable links for %s; importing one page", host)
    return article.from_article_url(url, source_type=source_type)
