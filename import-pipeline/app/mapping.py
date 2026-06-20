"""[5] Mapper: EntryDraft list -> MappedImport (Atlas Collection/Entry/Source/Relation specs).

Relations are expressed in terms of stable `source_key`s; the writer resolves them to row ids
after the entries are inserted. PART_OF comes from the heading hierarchy (child -> parent).
SEE_ALSO is a conservative best-effort from internal links that resolve to a known anchor.
"""

from __future__ import annotations

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


def _entry_url(meta: DocMeta, anchor: str | None) -> str | None:
    if not meta.source_url:
        return None
    return f"{meta.source_url}#{anchor}" if anchor else meta.source_url


def _entry_spec(draft: EntryDraft, meta: DocMeta, scope: str, import_id: str) -> EntrySpec:
    breadcrumb = _BREADCRUMB_SEP.join(draft.breadcrumb)
    metadata = {
        "sourceKey": draft.source_key,
        "breadcrumb": breadcrumb,
        "headingLevel": draft.level,
        "scope": scope,
        "importId": import_id,
    }
    if meta.source_url:
        metadata["sourceUrl"] = _entry_url(meta, draft.anchor)

    source = {
        "sourceType": str(meta.source_type),
        "title": meta.title,
        "url": _entry_url(meta, draft.anchor),
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


def _fragment(href: str) -> str | None:
    """Pull the anchor fragment from an internal link, e.g. '../tools/#x' -> 'x'."""
    if href.startswith(("http://", "https://", "mailto:")):
        return None
    if "#" not in href:
        return None
    fragment = href.rsplit("#", 1)[1].strip()
    return fragment or None


def _relations(drafts: list[EntryDraft]) -> list[RelationSpec]:
    relations: list[RelationSpec] = []

    # PART_OF: each entry is a component of its parent.
    for draft in drafts:
        if draft.parent_key is not None:
            relations.append(
                RelationSpec(draft.source_key, draft.parent_key, RelationType.PART_OF)
            )

    # SEE_ALSO: resolve internal links to a known heading anchor (both directions, like the app).
    anchor_to_key = {d.anchor: d.source_key for d in drafts if d.anchor}
    seen: set[tuple[str, str]] = set()
    for draft in drafts:
        for href in draft.out_links:
            fragment = _fragment(href)
            target = anchor_to_key.get(fragment) if fragment else None
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
    return MappedImport(collection=collection, entries=entries, relations=_relations(drafts))
