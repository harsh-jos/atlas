"""Core data types shared across pipeline stages."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field


@dataclass
class Page:
    """One fetched documentation page with full provenance."""

    url: str                      # normalized URL this page is identified by
    title: str
    markdown: str
    fetched_at: str               # ISO 8601 UTC
    canonical: str | None = None  # <link rel="canonical"> target, if present
    headings: list[str] = field(default_factory=list)
    word_count: int = 0

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.markdown.encode("utf-8", "replace")).hexdigest()[:16]

    def to_dict(self) -> dict:
        return {
            "url": self.url,
            "title": self.title,
            "markdown": self.markdown,
            "fetched_at": self.fetched_at,
            "canonical": self.canonical,
            "headings": self.headings,
            "word_count": self.word_count,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Page":
        return cls(
            url=d["url"],
            title=d.get("title", ""),
            markdown=d.get("markdown", ""),
            fetched_at=d.get("fetched_at", ""),
            canonical=d.get("canonical"),
            headings=d.get("headings", []),
            word_count=d.get("word_count", 0),
        )


def slugify(text: str, max_len: int = 60) -> str:
    """Filesystem- and URL-safe slug: lowercase, hyphen-separated, ASCII."""
    s = text.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:max_len].rstrip("-") or "untitled"
