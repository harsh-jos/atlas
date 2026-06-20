"""Website / documentation source adapter, tiered cheapest-first:

  1. /llms-full.txt or /llms.txt  — whole docs as one markdown file (one request, lossless).
  2. /sitemap.xml                 — enumerate pages, extract each, graft into one tree.
  3. single page                  — fall back to the article adapter.

Everything still funnels through `parse_markdown`, so segmentation is unchanged.
"""

from __future__ import annotations

import logging
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

import httpx

from app.models import DocMeta, Section, SourceType, StructuredDocument
from app.parsing.markdown_parser import parse_markdown
from app.slugify import slugify
from app.sources import article
from app.sources.base import SourceFetchError, SourceResult

log = logging.getLogger(__name__)

_MAX_PAGES = 200
_TIMEOUT = httpx.Timeout(30.0)
_HEADERS = {"User-Agent": "AtlasImportPipeline/0.1 (+local)"}


def _host(url: str) -> str:
    return urlparse(url).netloc or url


def _base(url: str) -> str:
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return f"{parsed.scheme}://{parsed.netloc}/"


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


def _sitemap_urls(base: str) -> list[str]:
    response = _get(urljoin(base, "sitemap.xml"))
    if response is None:
        return []
    host = _host(base)
    pages = [url for url in _locs(response.content) if _host(url) == host]
    if len(pages) > _MAX_PAGES:
        log.warning("sitemap for %s has %d pages; capping at %d", host, len(pages), _MAX_PAGES)
        pages = pages[:_MAX_PAGES]
    return pages


def _relevel(section: Section, level: int) -> None:
    delta = level - section.level

    def shift(node: Section) -> None:
        node.level += delta
        for child in node.children:
            shift(child)

    shift(section)


def _from_pages(base: str, host: str, urls: list[str], source_type: SourceType) -> StructuredDocument:
    site = Section(title=host, level=0, anchor=slugify(host))
    for url in urls:
        try:
            page = article.from_article_url(url, source_type=source_type)
        except SourceFetchError as error:
            log.warning("skipping %s: %s", url, error)
            continue
        page_root = page.doc.root
        page_root.title = page.doc.meta.title
        _relevel(page_root, 1)
        site.children.append(page_root)

    if not site.children:
        raise SourceFetchError(f"sitemap for {host} yielded no readable pages")

    meta = DocMeta(title=host, source_type=source_type, source_url=base)
    return StructuredDocument(meta=meta, root=site)


def from_website(url: str, *, source_type: SourceType = SourceType.DOCS) -> SourceResult:
    base = _base(url)
    host = _host(base)

    # Tier 1: llms-full.txt / llms.txt
    for name in ("llms-full.txt", "llms.txt"):
        response = _get(urljoin(base, name))
        if response is not None and _looks_like_markdown(response.text):
            log.info("using %s for %s", name, host)
            doc = parse_markdown(
                response.text, fallback_title=host, source_type=source_type, source_url=base
            )
            return SourceResult(doc=doc, scope=host, suggested_collection=doc.meta.title or host)

    # Tier 2: sitemap.xml
    pages = _sitemap_urls(base)
    if pages:
        log.info("crawling %d pages from %s sitemap", len(pages), host)
        doc = _from_pages(base, host, pages, source_type)
        return SourceResult(doc=doc, scope=host, suggested_collection=host)

    # Tier 3: single page
    log.warning("no llms.txt or sitemap for %s; importing as a single article", host)
    return article.from_article_url(url, source_type=source_type)
