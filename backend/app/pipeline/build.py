"""The shared interior: StructuredDocument -> MappedImport.

Every source adapter (Phase 2) parses into a StructuredDocument and then calls `build_import`,
so segmentation, enrichment, and mapping are written exactly once. The writer persists the result.
"""

from __future__ import annotations

from uuid import uuid4

from app.pipeline.enrich import DeterministicEnricher, Enricher
from app.pipeline.mapping import map_import
from app.pipeline.models import ConceptSpec, MappedImport, StructuredDocument
from app.pipeline.segment import DEFAULT_MAX_SPLIT_LEVEL, segment

DEFAULT_MIN_ARTIFACT_CHARS = 600


def build_import(
    doc: StructuredDocument,
    *,
    concept_name: str,
    scope: str,
    import_id: str | None = None,
    min_artifact_chars: int = DEFAULT_MIN_ARTIFACT_CHARS,
    max_split_level: int = DEFAULT_MAX_SPLIT_LEVEL,
    enricher: Enricher | None = None,
    concept_color: str | None = None,
    concept_description: str | None = None,
) -> MappedImport:
    import_id = import_id or str(uuid4())
    enricher = enricher or DeterministicEnricher()

    drafts = segment(
        doc, scope=scope, min_artifact_chars=min_artifact_chars, max_split_level=max_split_level
    )
    enricher.enrich_all(drafts, doc.meta)

    concept = ConceptSpec(
        name=concept_name,
        description=concept_description,
        color=concept_color,
    )
    return map_import(
        drafts, meta=doc.meta, concept=concept, scope=scope, import_id=import_id
    )
