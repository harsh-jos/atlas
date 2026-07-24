"""The shared interior: StructuredDocument -> MappedImport.

Every source adapter (Phase 2) parses into a StructuredDocument and then calls `build_import`,
so segmentation, enrichment, and mapping are written exactly once. The writer persists the result.
"""

from __future__ import annotations

from uuid import uuid4

from app.pipeline.enrich import DeterministicEnricher, Enricher
from app.pipeline.mapping import map_import
from app.pipeline.models import CollectionSpec, MappedImport, StructuredDocument
from app.pipeline.segment import DEFAULT_MAX_SPLIT_LEVEL, segment

DEFAULT_MIN_ENTRY_CHARS = 600


def build_import(
    doc: StructuredDocument,
    *,
    collection_name: str,
    scope: str,
    import_id: str | None = None,
    min_entry_chars: int = DEFAULT_MIN_ENTRY_CHARS,
    max_split_level: int = DEFAULT_MAX_SPLIT_LEVEL,
    enricher: Enricher | None = None,
    collection_color: str | None = None,
    collection_description: str | None = None,
) -> MappedImport:
    import_id = import_id or str(uuid4())
    enricher = enricher or DeterministicEnricher()

    drafts = segment(
        doc, scope=scope, min_entry_chars=min_entry_chars, max_split_level=max_split_level
    )
    enricher.enrich_all(drafts, doc.meta)

    collection = CollectionSpec(
        name=collection_name,
        description=collection_description,
        color=collection_color,
    )
    return map_import(
        drafts, meta=doc.meta, collection=collection, scope=scope, import_id=import_id
    )
