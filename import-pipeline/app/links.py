"""Resolve an entry's outbound links to other entries — the source of SEE_ALSO edges.

Two kinds of internal link resolve to a target entry:

  * same-document anchors (`#section`) — the only kind the baseline handled. Fine for a single
    `llms-full.txt` file where every heading is an anchor in one document (e.g. MCP).
  * cross-page links (`/requests/`, `../guide`, `https://site/x`) — needed for sitemap crawls,
    where each page is its own subtree. The baseline lost these entirely, so a crawled docs set
    imported as a bare PART_OF tree with no cross-references.

Built once per import from all drafts, then queried per link. A page's URL maps to that page's
root entry (the first draft seen for the URL in document order).
"""

from __future__ import annotations

from urllib.parse import urljoin, urlparse

from app.models import EntryDraft

_SKIP_SCHEMES = ("mailto:", "tel:", "javascript:")


def _normalize(url: str) -> str:
    """Drop fragment, query, and trailing slash so equal pages compare equal."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


class LinkResolver:
    def __init__(self, drafts: list[EntryDraft], *, fallback_base: str | None) -> None:
        self._anchor_to_key = {d.anchor: d.source_key for d in drafts if d.anchor}
        self._base_of: dict[str, str | None] = {}
        self._url_to_key: dict[str, str] = {}
        for draft in drafts:
            base = draft.source_url or fallback_base
            self._base_of[draft.source_key] = base
            if base:
                # First draft per page URL is its root entry (drafts are in document order).
                self._url_to_key.setdefault(_normalize(base), draft.source_key)

    def resolve(self, href: str, *, from_key: str) -> str | None:
        """The source_key an internal link points at, or None if it leaves the import."""
        href = href.strip()
        if not href or href.startswith(_SKIP_SCHEMES):
            return None

        path_part, _, fragment = href.partition("#")

        # Pure "#anchor": a same-document reference.
        if not path_part:
            return self._anchor_to_key.get(fragment)

        # A path (absolute or relative): resolve against this entry's own page, then match a page.
        base = self._base_of.get(from_key)
        if base:
            target = self._url_to_key.get(_normalize(urljoin(base, path_part)))
            if target:
                return target

        # Fall back to a fragment that names a known heading anchor (e.g. "../tools/#function-tools"
        # inside a single document, where every page shares one base URL).
        return self._anchor_to_key.get(fragment) if fragment else None
