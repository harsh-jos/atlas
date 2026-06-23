"""Where to look for a docs site's machine-readable index, and which crawled URLs to keep.

Two baseline bugs lived here:

  * llms.txt / sitemap.xml were only ever probed at the *domain root*, so docs hosted under a
    path prefix (docs.astral.sh/uv/, readthedocs /en/stable/) never found their index and fell
    all the way back to a single-page scrape. We now probe the doc's subpath first, then root.
  * the sitemap's URLs were filtered against the *input* host, so a site that canonicalises to a
    sibling host (www.starlette.io → starlette.dev) had every page discarded. A site's own
    sitemap is authoritative, so we compare by registrable domain, not exact host.
"""

from __future__ import annotations

from urllib.parse import urljoin, urlparse

_LLMS_FILES = ("llms-full.txt", "llms.txt")  # richest first
_SITEMAP_FILE = "sitemap.xml"


def _normalize(url: str) -> str:
    return url if "://" in url else f"https://{url}"


def host(url: str) -> str:
    return urlparse(_normalize(url)).netloc


def domain_base(url: str) -> str:
    """Scheme + host root, e.g. https://docs.astral.sh/uv/x -> https://docs.astral.sh/."""
    parsed = urlparse(_normalize(url))
    return f"{parsed.scheme}://{parsed.netloc}/"


def subpath_base(url: str) -> str:
    """Scheme + host + the directory portion of the path, e.g. .../uv/guide -> .../uv/."""
    parsed = urlparse(_normalize(url))
    path = parsed.path
    if not path.endswith("/"):
        path = path.rsplit("/", 1)[0] + "/" if "/" in path.strip("/") else "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _bases(url: str) -> list[str]:
    """Subpath first, then domain root — de-duplicated, order preserved."""
    seen: list[str] = []
    for base in (subpath_base(url), domain_base(url)):
        if base not in seen:
            seen.append(base)
    return seen


def llms_candidates(url: str) -> list[str]:
    """Candidate llms-full.txt / llms.txt URLs to try, richest and most-specific first."""
    return [urljoin(base, name) for base in _bases(url) for name in _LLMS_FILES]


def sitemap_candidates(url: str) -> list[str]:
    """Candidate sitemap.xml URLs to try, most-specific first."""
    return [urljoin(base, _SITEMAP_FILE) for base in _bases(url)]


def registrable_domain(url_or_host: str) -> str:
    """The last two labels of the host — a cheap eTLD+1 good enough to treat
    www.starlette.io and starlette.dev's own sitemap as the same site."""
    netloc = host(url_or_host) or url_or_host
    labels = netloc.split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else netloc


def same_site(a: str, b: str) -> bool:
    """Whether two URLs/hosts belong to the same registrable domain."""
    return registrable_domain(a) == registrable_domain(b)


def select_pages(locs: list[str], served_from: str) -> tuple[list[str], int]:
    """Pick the page URLs that belong to the site this sitemap describes.

    Normally that's the registrable domain the sitemap was *served from* (handles www↔apex).
    But a sitemap may canonicalise to a different host entirely — www.starlette.io's sitemap
    lists starlette.dev URLs. A sitemap is authoritative for its own site, so if every loc
    points at a single *other* domain we adopt it. Genuinely mixed external hosts are dropped.

    Returns (kept_pages, dropped_count) so the caller can report what it ignored.
    """
    if not locs:
        return [], 0
    kept = [u for u in locs if same_site(u, served_from)]
    if kept:
        return kept, len(locs) - len(kept)
    if len({registrable_domain(u) for u in locs}) == 1:
        return locs, 0  # one consistent canonical host — trust the authoritative sitemap
    return [], len(locs)
