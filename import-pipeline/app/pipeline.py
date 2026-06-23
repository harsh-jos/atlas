"""The shared interior: StructuredDocument -> MappedImport.

Every source adapter (Phase 2) parses into a StructuredDocument and then calls `build_import`,
so segmentation, enrichment, and mapping are written exactly once. The writer persists the result.
"""

from __future__ import annotations

from uuid import uuid4

from app.enrich import DeterministicEnricher, Enricher
from app.mapping import map_import
from app.models import CollectionSpec, MappedImport, StructuredDocument
from app.segment import DEFAULT_MAX_ENTRY_CHARS, segment

DEFAULT_MIN_ENTRY_CHARS = 200


def build_import(
    doc: StructuredDocument,
    *,
    collection_name: str,
    scope: str,
    import_id: str | None = None,
    min_entry_chars: int = DEFAULT_MIN_ENTRY_CHARS,
    max_entry_chars: int = DEFAULT_MAX_ENTRY_CHARS,
    enricher: Enricher | None = None,
    collection_color: str | None = None,
    collection_description: str | None = None,
) -> MappedImport:
    import_id = import_id or str(uuid4())
    enricher = enricher or DeterministicEnricher()

    drafts = segment(
        doc, scope=scope, min_entry_chars=min_entry_chars, max_entry_chars=max_entry_chars
    )
    for draft in drafts:
        enricher.enrich(draft, doc.meta)

    collection = CollectionSpec(
        name=collection_name,
        description=collection_description,
        color=collection_color,
    )
    return map_import(
        drafts, meta=doc.meta, collection=collection, scope=scope, import_id=import_id
    )
