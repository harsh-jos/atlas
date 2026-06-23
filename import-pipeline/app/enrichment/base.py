"""The enrichment seam: the `Enricher` Protocol every implementation satisfies, and the typed
`EnrichmentResult` that an LLM response is parsed into at the boundary.

`build_import` depends only on `Enricher` (dependency inversion), so the deterministic enricher
and the LLM enricher are swapped by configuration, never by editing the pipeline.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field, field_validator

from app.models import DocMeta, EntryDraft

MAX_TAGS = 6
_SUMMARY_LIMIT = 400


class Enricher(Protocol):
    def enrich(self, draft: EntryDraft, meta: DocMeta) -> None:
        """Fill `draft.summary` and `draft.tags` (and `draft.enriched_by`) in place."""
        ...


class EnrichmentResult(BaseModel):
    """A model response parsed and validated before it is allowed to touch an entry.

    Parsing here (rather than reading a raw dict) means a malformed or shape-changed response
    fails loudly at the boundary instead of silently producing an empty summary."""

    summary: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)

    @field_validator("summary")
    @classmethod
    def _trim_summary(cls, value: str) -> str:
        value = value.strip()
        if len(value) <= _SUMMARY_LIMIT:
            return value
        return value[:_SUMMARY_LIMIT].rsplit(" ", 1)[0].rstrip(",.;:") + "…"

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for tag in value:
            normalized = tag.strip().lower()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned[:MAX_TAGS]
