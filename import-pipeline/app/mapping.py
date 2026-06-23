"""[5] Mapper: EntryDraft list -> MappedImport (Atlas Collection/Entry/Source/Relation specs).

Relations are expressed in terms of stable `source_key`s; the writer resolves them to row ids
after the entries are inserted. PART_OF comes from the heading hierarchy (child -> parent).
SEE_ALSO is a conservative best-effort from internal links that resolve (via `LinkResolver`) to
another entry — a same-document anchor or a cross-page URL.
"""

from __future__ import annotations

from app.links import LinkResolver
from app.models import (
    CollectionSpec,
    DocMeta,
    EntryDraft,
    EntrySpec,
    MappedImport,
    RelationSpec,
    RelationType,
)

_BREADCRUMB_SEP = " › "


def _entry_url(draft: EntryDraft, meta: DocMeta) -> str | None:
    """The entry's own page URL (per-page on crawls; the document URL otherwise) + its anchor."""
    base = draft.source_url or meta.source_url
    if not base:
        return None
    return f"{base}#{draft.anchor}" if draft.anchor else base


def _entry_spec(draft: EntryDraft, meta: DocMeta, scope: str, import_id: str) -> EntrySpec:
    breadcrumb = _BREADCRUMB_SEP.join(draft.breadcrumb)
    url = _entry_url(draft, meta)
    metadata = {
        "sourceKey": draft.source_key,
        "breadcrumb": breadcrumb,
        "headingLevel": draft.level,
        "scope": scope,
        "importId": import_id,
    }
    if url:
        metadata["sourceUrl"] = url
    if draft.structural:
        metadata["structural"] = True  # heading-only node — render as a section, not an article

    source = {
        "sourceType": str(meta.source_type),
        "title": meta.title,
        "url": url,
        "author": meta.authors[0] if meta.authors else None,
        "ref": breadcrumb,
    }
    return EntrySpec(
        source_key=draft.source_key,
        title=draft.title,
        summary=draft.summary,
        body=draft.body_md or None,
        tags=draft.tags,
        metadata=metadata,
        source=source,
    )


def _relations(drafts: list[EntryDraft], *, fallback_base: str | None) -> list[RelationSpec]:
    relations: list[RelationSpec] = []

    # PART_OF: each entry is a component of its parent.
    for draft in drafts:
        if draft.parent_key is not None:
            relations.append(
                RelationSpec(draft.source_key, draft.parent_key, RelationType.PART_OF)
            )

    # SEE_ALSO: resolve internal links (same-doc anchors and cross-page URLs) to a target entry,
    # both directions like the app.
    resolver = LinkResolver(drafts, fallback_base=fallback_base)
    seen: set[tuple[str, str]] = set()
    for draft in drafts:
        for href in draft.out_links:
            target = resolver.resolve(href, from_key=draft.source_key)
            if not target or target == draft.source_key or target == draft.parent_key:
                continue
            for a, b in ((draft.source_key, target), (target, draft.source_key)):
                if (a, b) not in seen:
                    seen.add((a, b))
                    relations.append(RelationSpec(a, b, RelationType.SEE_ALSO))
    return relations


def map_import(
    drafts: list[EntryDraft],
    *,
    meta: DocMeta,
    collection: CollectionSpec,
    scope: str,
    import_id: str,
) -> MappedImport:
    entries = [_entry_spec(draft, meta, scope, import_id) for draft in drafts]
    relations = _relations(drafts, fallback_base=meta.source_url)
    return MappedImport(collection=collection, entries=entries, relations=relations)
