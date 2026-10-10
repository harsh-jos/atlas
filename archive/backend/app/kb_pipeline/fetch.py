"""Discovery and polite crawling of a documentation site.

Deterministic by design: no LLM is involved here. The job of this layer is to
fetch candidate pages exactly once, with correct per-page provenance, and leave
all judgments about *meaning* to the triage stage.

Ordering of gates for every candidate URL:
scope filter -> skip patterns -> robots -> fetch -> canonical collapse -> dedupe.
The page cap is applied last, never before scope filtering.
"""
from __future__ import annotations

import re
import time
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urljoin, urlparse, urlunparse, parse_qsl, urlencode

import httpx

USER_AGENT = "atlas-pipeline/0.1 (+https://github.com/slash-atlas; learning-kb builder)"

# Query params that never change page content.
_TRACKING_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_term",
                    "utm_content", "gclid", "fbclid", "ref", "ref_src"}

# Common non-English locale path segments on docs sites.
_LOCALE_SEGMENTS = {
    "ja", "zh", "zh-cn", "zh-tw", "ko", "fr", "de", "es", "pt", "pt-br",
    "ru", "it", "pl", "tr", "id", "vi", "th", "ar", "fa", "he", "uk", "cs",
}

# Path fragments that mark machinery, not content (sphinx/mkdocs/docusaurus).
_SKIP_PATH_RE = re.compile(
    r"/(_sources|_modules|_static|_images|_downloads|genindex|py-modindex|search)"
    r"(\.html|/|$)|/page/\d+(/|$)"
)

_BINARY_EXT_RE = re.compile(
    r"\.(pdf|zip|tar|gz|tgz|whl|png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|woff2?|ttf|eot|mp[34]|webm|ipynb)$",
    re.IGNORECASE,
)

_HREF_RE = re.compile(r"""<a\s[^>]*?href=["']([^"'#]+)[#"']""", re.IGNORECASE)
_CANONICAL_RE = re.compile(
    r"""<link\s[^>]*?rel=["']canonical["'][^>]*?href=["']([^"']+)["']|"""
    r"""<link\s[^>]*?href=["']([^"']+)["'][^>]*?rel=["']canonical["']""",
    re.IGNORECASE,
)


def normalize_url(url: str, base: str | None = None) -> str | None:
    """Resolve, strip fragment and tracking params, canonicalize form.

    Returns None for non-http(s) targets.
    """
    if base:
        url = urljoin(base, url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
             if k.lower() not in _TRACKING_PARAMS]
    path = re.sub(r"/{2,}", "/", parsed.path) or "/"
    # index pages are the same resource as their directory
    path = re.sub(r"/index\.html?$", "/", path)
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, "",
                       urlencode(query), ""))


def scope_of(url: str) -> str:
    """The URL prefix a crawl is confined to.

    For https://docs.pytorch.org/tutorials/beginner/basics.html the scope is
    https://docs.pytorch.org/tutorials/ ; for a URL ending in / the scope is
    the URL itself; for a bare host it is host/.
    """
    parsed = urlparse(url)
    path = parsed.path or "/"
    if not path.endswith("/"):
        path = path.rsplit("/", 1)[0] + "/"
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, "", "", ""))


def in_scope(url: str, scope: str) -> bool:
    return url.startswith(scope)


def should_skip(url: str) -> bool:
    """Deterministic garbage gates: machinery pages, binaries, locales."""
    parsed = urlparse(url)
    path = parsed.path.lower()
    if _BINARY_EXT_RE.search(path):
        return True
    if _SKIP_PATH_RE.search(path):
        return True
    segments = [s for s in path.split("/") if s]
    return any(seg in _LOCALE_SEGMENTS for seg in segments[:2])


def extract_links(html: str, base_url: str) -> list[str]:
    """All same-document links, normalized. Order-preserving, deduplicated."""
    seen: set[str] = set()
    out: list[str] = []
    for match in _HREF_RE.finditer(html):
        norm = normalize_url(match.group(1), base=base_url)
        if norm and norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out


def extract_canonical(html: str, base_url: str) -> str | None:
    m = _CANONICAL_RE.search(html)
    if not m:
        return None
    return normalize_url(m.group(1) or m.group(2), base=base_url)


def parse_sitemap(xml_text: str) -> tuple[list[str], list[str]]:
    """Return (page_urls, child_sitemap_urls). Namespace-agnostic."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return [], []
    tag = root.tag.rsplit("}", 1)[-1]
    locs = [el.text.strip() for el in root.iter() if el.tag.endswith("loc") and el.text]
    if tag == "sitemapindex":
        return [], locs
    return locs, []


def parse_llms_txt_links(text: str, base_url: str) -> list[str]:
    """llms.txt is by spec a link index — extract its links, never its prose."""
    urls: list[str] = []
    for m in re.finditer(r"\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)", text):
        norm = normalize_url(m.group(1), base=base_url)
        if norm:
            urls.append(norm)
    return urls


class Robots:
    """Per-host robots.txt cache. Fails open on fetch errors."""

    def __init__(self, fetch_text: Callable[[str], str | None]):
        self._fetch_text = fetch_text
        self._parsers: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    def _parser_for(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        host = urlparse(url).netloc
        if host not in self._parsers:
            robots_url = urlunparse((urlparse(url).scheme, host, "/robots.txt", "", "", ""))
            text = self._fetch_text(robots_url)
            if text is None:
                self._parsers[host] = None
            else:
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(text.splitlines())
                self._parsers[host] = parser
        return self._parsers[host]

    def allowed(self, url: str) -> bool:
        parser = self._parser_for(url)
        return True if parser is None else parser.can_fetch(USER_AGENT, url)

    def sitemaps(self, url: str) -> list[str]:
        parser = self._parser_for(url)
        return list(parser.site_maps() or []) if parser else []


class Fetcher:
    """HTTP client with a per-host politeness delay and in-memory dedupe."""

    def __init__(self, delay: float = 0.3, timeout: float = 20.0):
        self.delay = delay
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
            follow_redirects=True,
        )
        self._last_hit: dict[str, float] = {}

    def _wait(self, url: str) -> None:
        host = urlparse(url).netloc
        elapsed = time.monotonic() - self._last_hit.get(host, 0.0)
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_hit[host] = time.monotonic()

    def get_text(self, url: str) -> str | None:
        """Fetch any text resource; None on any failure."""
        self._wait(url)
        try:
            resp = self._client.get(url)
            if resp.status_code != 200:
                return None
            return resp.text
        except httpx.HTTPError:
            return None

    def get_html(self, url: str) -> tuple[str, str] | None:
        """Fetch an HTML page. Returns (final_url, html) or None."""
        self._wait(url)
        try:
            resp = self._client.get(url)
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        ctype = resp.headers.get("content-type", "")
        if "html" not in ctype and "xml" not in ctype and ctype:
            return None
        final = normalize_url(str(resp.url)) or url
        return final, resp.text

    def close(self) -> None:
        self._client.close()


@dataclass
class CrawlResult:
    pages: list[tuple[str, str]] = field(default_factory=list)  # (url, html)
    skipped_out_of_scope: int = 0
    skipped_pattern: int = 0
    skipped_robots: int = 0
    truncated: int = 0  # in-scope candidates dropped by the page cap


def discover_candidates(seed: str, scope: str, fetcher: Fetcher, robots: Robots,
                        log: Callable[[str], None] = print) -> list[str]:
    """Sitemap-first discovery, llms.txt as a link index. Scope-filtered
    BEFORE any truncation — the whole point of doing discovery this way."""
    candidates: list[str] = []
    seen: set[str] = set()

    def add(url: str) -> None:
        if url not in seen and in_scope(url, scope) and not should_skip(url):
            seen.add(url)
            candidates.append(url)

    sitemap_urls = robots.sitemaps(seed) or [urljoin(scope_root(seed), "/sitemap.xml")]
    child_budget = 30
    queue = list(sitemap_urls)
    while queue and child_budget > 0:
        sm_url = queue.pop(0)
        child_budget -= 1
        text = fetcher.get_text(sm_url)
        if not text:
            continue
        pages, children = parse_sitemap(text)
        for loc in pages:
            norm = normalize_url(loc)
            if norm:
                add(norm)
        # descend only into child sitemaps that could contain in-scope URLs
        queue.extend(c for c in children
                     if urlparse(c).netloc.lower() == urlparse(scope).netloc)
    if candidates:
        log(f"  sitemap: {len(candidates)} in-scope pages")

    for name in ("llms.txt", "llms-full.txt"):
        text = fetcher.get_text(urljoin(scope, name))
        if text:
            before = len(candidates)
            for link in parse_llms_txt_links(text, base_url=scope):
                add(link)
            if len(candidates) > before:
                log(f"  {name}: +{len(candidates) - before} in-scope links")
            break
    return candidates


def scope_root(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))


def crawl_site(seed: str, *, fetcher: Fetcher, robots: Robots, max_pages: int = 150,
               scope: str | None = None,
               log: Callable[[str], None] = print) -> CrawlResult:
    """Fetch every in-scope page exactly once: seeded by sitemap/llms.txt,
    expanded by BFS over links found in fetched pages."""
    seed_norm = normalize_url(seed)
    if seed_norm is None:
        raise ValueError(f"not an http(s) URL: {seed}")
    scope = scope or scope_of(seed_norm)
    result = CrawlResult()

    queue: list[str] = [seed_norm] + discover_candidates(seed_norm, scope, fetcher, robots, log)
    enqueued: set[str] = set(queue)
    fetched_identity: set[str] = set()   # canonical/final URLs already taken

    while queue:
        url = queue.pop(0)
        if len(result.pages) >= max_pages:
            result.truncated += 1
            continue
        if not in_scope(url, scope):
            result.skipped_out_of_scope += 1
            continue
        if should_skip(url):
            result.skipped_pattern += 1
            continue
        if not robots.allowed(url):
            result.skipped_robots += 1
            continue

        got = fetcher.get_html(url)
        if got is None:
            continue
        final_url, html = got
        identity = extract_canonical(html, final_url) or final_url
        # a canonical pointing out of scope means this content lives elsewhere
        if identity in fetched_identity:
            continue
        fetched_identity.add(identity)
        page_url = identity if in_scope(identity, scope) else final_url
        result.pages.append((page_url, html))
        if len(result.pages) % 25 == 0:
            log(f"  fetched {len(result.pages)} pages...")

        for link in extract_links(html, base_url=final_url):
            if link not in enqueued and in_scope(link, scope) and not should_skip(link):
                enqueued.add(link)
                queue.append(link)

    if result.truncated:
        log(f"  page cap reached: {result.truncated} in-scope candidates not fetched "
            f"(raise --max-pages to include them)")
    return result
