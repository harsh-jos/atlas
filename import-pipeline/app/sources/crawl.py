"""Bounded, breadth-first link crawler for docs sites with no llms.txt and no sitemap.

Given a start URL and a path prefix, it follows same-prefix `<a href>` links level by level,
fetching each level concurrently, until it runs out of new pages or hits the page/depth cap.
It returns an *ordered* list of page URLs (start first, then by discovery order); content
extraction stays in the website adapter, so this module only has to find the pages.
"""

from __future__ import annotations

import logging
import re
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urldefrag, urljoin, urlparse

import httpx

log = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(20.0)
_HEADERS = {"User-Agent": "AtlasImportPipeline/0.1 (+local)"}
_WORKERS = 8
_MAX_DEPTH = 4
_HREF = re.compile(r"""<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
# Asset/download links that are never HTML pages worth crawling.
_SKIP_EXT = (
    ".pdf", ".zip", ".gz", ".tar", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".ico", ".css", ".js", ".json", ".xml", ".txt", ".mp4", ".mp3", ".woff", ".woff2",
)


def _normalize(url: str) -> str:
    """Drop the fragment and any trailing 'index.html' so the same page isn't crawled twice."""
    url, _ = urldefrag(url)
    if url.endswith("/index.html"):
        url = url[: -len("index.html")]
    return url


def _fetch_html(url: str) -> str | None:
    try:
        response = httpx.get(url, headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
    except httpx.HTTPError as error:
        log.warning("crawl fetch failed %s: %s", url, error)
        return None
    if response.status_code != 200:
        return None
    if "html" not in response.headers.get("content-type", "text/html"):
        return None
    return response.text


def _links(html: str, page_url: str, prefix: str) -> list[str]:
    out: list[str] = []
    for href in _HREF.findall(html):
        target = _normalize(urljoin(page_url, href))
        if not target.startswith(prefix):
            continue
        if urlparse(target).path.lower().endswith(_SKIP_EXT):
            continue
        out.append(target)
    return out


def crawl_pages(start_url: str, *, prefix: str, max_pages: int, max_depth: int = _MAX_DEPTH) -> list[str]:
    start = _normalize(start_url)
    ordered: list[str] = [start]
    seen: set[str] = {start}
    frontier: deque[tuple[str, int]] = deque([(start, 0)])

    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        while frontier and len(ordered) < max_pages:
            # Drain the current depth level and fetch it concurrently.
            level: list[tuple[str, int]] = []
            depth = frontier[0][1]
            while frontier and frontier[0][1] == depth:
                level.append(frontier.popleft())
            if depth >= max_depth:
                break

            htmls = pool.map(lambda item: _fetch_html(item[0]), level)
            for (page_url, _), html in zip(level, htmls, strict=True):
                if not html:
                    continue
                for target in _links(html, page_url, prefix):
                    if target in seen:
                        continue
                    seen.add(target)
                    ordered.append(target)
                    frontier.append((target, depth + 1))

    if len(ordered) > max_pages:
        log.warning("crawl under %s found %d pages; importing the first %d",
                    prefix, len(ordered), max_pages)
        ordered = ordered[:max_pages]
    return ordered
