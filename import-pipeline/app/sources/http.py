"""One shared, pooled HTTP client for the website adapter.

Opening a fresh connection per request is a silent performance tax (rulebook §3.6); a single
reused `httpx.Client` keeps the connection pool warm across the many small requests a docs
import makes (index probes, sitemap, per-page crawl). The client is created lazily and lives
for the process.
"""

from __future__ import annotations

import logging

import httpx

log = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0)
_HEADERS = {"User-Agent": "AtlasImportPipeline/0.1 (+local)"}

_client: httpx.Client | None = None


def get_client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True)
    return _client


def get_ok(url: str) -> httpx.Response | None:
    """GET `url`, returning the response only on 200, or None on any error/non-200.

    A None here means "this candidate location isn't usable" — the caller decides what that
    implies. It is deliberately distinct from a fetch that raises (a hard failure).
    """
    try:
        response = get_client().get(url)
    except httpx.HTTPError as error:
        log.warning("fetch failed %s: %s", url, error)
        return None
    return response if response.status_code == 200 else None
