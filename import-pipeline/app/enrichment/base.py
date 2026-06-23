"""The enrichment seam: the `Enricher` Protocol every implementation satisfies, and the typed
`EnrichmentResult` that an LLM response is parsed into at the boundary.

`build_import` depends only on `Enricher` (dependency inversion), so the deterministic enricher
and the LLM enricher are swapped by configuration, never by editing the pipeline.
"""

from __future__ import annotations

import re
from typing import Protocol

from pydantic import BaseModel, Field, field_validator

from app.models import DocMeta, EntryDraft

MAX_TAGS = 6
_MAX_TAG_LEN = 40  # longer than this is a sentence, not a tag — drop it
_SUMMARY_LIMIT = 400
_TAG_SPLIT = re.compile(r"[,\n;]+")


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

    @field_validator("summary", mode="before")
    @classmethod
    def _coerce_summary(cls, value: object) -> str:
        # A bad model may return a number, list, or null where a string is expected.
        if value is None:
            return ""
        if isinstance(value, list):
            return " ".join(str(item) for item in value)
        return str(value)

    @field_validator("summary")
    @classmethod
    def _trim_summary(cls, value: str) -> str:
        value = value.strip()
        if len(value) <= _SUMMARY_LIMIT:
            return value
        return value[:_SUMMARY_LIMIT].rsplit(" ", 1)[0].rstrip(",.;:") + "…"

    @field_validator("tags", mode="before")
    @classmethod
    def _coerce_tags(cls, value: object) -> list[str]:
        # Accept a comma/line-separated string, a single tag, or null — not just a clean list.
        if value is None:
            return []
        if isinstance(value, str):
            return [part for part in _TAG_SPLIT.split(value) if part.strip()]
        if isinstance(value, list):
            return [str(item) for item in value]
        return []

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for tag in value:
            normalized = tag.strip().lower()
            if normalized and len(normalized) <= _MAX_TAG_LEN and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned[:MAX_TAGS]
