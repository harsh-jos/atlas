"""The pipeline's typed interior.

Every source is parsed into a `StructuredDocument` (parse at the boundary, trust the
interior). The segmenter turns that into `EntryDraft`s; the mapper turns those into a
`MappedImport` of Atlas rows; the writer persists it. Plain dataclasses keep the tree cheap
and easy to unit-test; pydantic is reserved for the HTTP boundary (Phase 3).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class SourceType(StrEnum):
    """Mirrors the Prisma `SourceType` enum."""

    BOOK = "BOOK"
    PAPER = "PAPER"
    DOCS = "DOCS"
    TUTORIAL = "TUTORIAL"
    COURSE = "COURSE"
    WEBSITE = "WEBSITE"


class RelationType(StrEnum):
    """Mirrors the Prisma `RelationType` enum."""

    PART_OF = "PART_OF"
    USES = "USES"
    PREREQUISITE = "PREREQUISITE"
    CONTRASTS = "CONTRASTS"
    SEE_ALSO = "SEE_ALSO"


# --- Parsed document (output of [2] parsers) ---------------------------------------------


@dataclass(slots=True)
class DocMeta:
    title: str
    source_type: SourceType
    source_url: str | None = None
    authors: list[str] = field(default_factory=list)
    published_at: str | None = None


@dataclass(slots=True)
class Section:
    """One heading and the content directly under it (excluding child headings)."""

    title: str | None
    level: int  # 0 = document root, 1 = H1, 2 = H2, ...
    content_md: str = ""
    anchor: str | None = None  # heading slug, for internal-link (SEE_ALSO) resolution
    links: list[str] = field(default_factory=list)  # hrefs found in this section's content
    children: list[Section] = field(default_factory=list)
    source_url: str | None = None  # the page this section came from (set per-page on crawls)


@dataclass(slots=True)
class StructuredDocument:
    meta: DocMeta
    root: Section  # synthetic level-0 node; its children are the top-level sections


# --- Segmented entries (output of [3] segmenter, enriched by [4]) -------------------------


@dataclass(slots=True)
class EntryDraft:
    source_key: str  # stable across re-imports: scope + breadcrumb path
    title: str
    breadcrumb: list[str]
    level: int
    body_md: str
    parent_key: str | None = None  # drives the PART_OF edge
    anchor: str | None = None
    out_links: list[str] = field(default_factory=list)  # drives SEE_ALSO edges
    source_url: str | None = None  # this entry's own page URL — provenance + cross-page links
    structural: bool = False  # a heading-only node kept to anchor the hierarchy, no body of its own
    summary: str | None = None  # filled by the enricher
    tags: list[str] = field(default_factory=list)  # filled by the enricher
    enriched_by: str | None = None  # which enricher produced this entry (observability)


# --- Mapped Atlas rows (output of [5] mapper, consumed by [6] writer) ---------------------


@dataclass(slots=True)
class CollectionSpec:
    name: str
    description: str | None = None
    color: str | None = None


@dataclass(slots=True)
class EntrySpec:
    source_key: str
    title: str
    summary: str | None
    body: str | None
    tags: list[str]
    metadata: dict
    source: dict | None  # provenance -> one Source row


@dataclass(slots=True)
class RelationSpec:
    from_key: str
    to_key: str
    relation_type: RelationType
    note: str | None = None


@dataclass(slots=True)
class MappedImport:
    collection: CollectionSpec
    entries: list[EntrySpec]
    relations: list[RelationSpec]
