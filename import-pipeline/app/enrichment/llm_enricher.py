"""LLM enricher: summary + tags from a remote model, with a loud, flagged fallback.

On any failure (transport, bad envelope, non-JSON, schema mismatch) or once the per-import
budget is spent, it degrades to the deterministic enricher and records *which* path produced
the entry in `draft.enriched_by` — so a degraded enrichment is visible, never a silent empty
summary. Per-entry calls are independent, so the batch layer can run them concurrently; the
shared counters are guarded by a lock.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from threading import Lock

from pydantic import ValidationError

from app.enrichment.base import Enricher, EnrichmentResult
from app.enrichment.llm_client import LLMClient, LLMError
from app.models import DocMeta, EntryDraft

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You enrich entries in a personal knowledge base. Given one entry, return a JSON object with "
    'exactly two keys: "summary" (1-3 plain-prose sentences, no markdown, capturing what the entry '
    'teaches) and "tags" (3-6 short lowercase topic keywords). Return JSON only, nothing else.'
)
_BODY_EXCERPT_CHARS = 4000

# A small model can return well-formed JSON whose summary is still useless (a single word, mostly
# punctuation, or just the title echoed back). These bars reject that so we fall back rather than
# write garbage — the deterministic summary is better than a bad one.
_MIN_USABLE_SUMMARY = 15
_MIN_LETTER_RATIO = 0.5


def _is_usable_summary(summary: str, draft: EntryDraft) -> bool:
    text = summary.strip()
    if len(text) < _MIN_USABLE_SUMMARY:
        return False
    if sum(ch.isalpha() for ch in text) < len(text) * _MIN_LETTER_RATIO:
        return False
    return text.lower() != draft.title.strip().lower()


@dataclass
class EnrichStats:
    """Per-import tally of how entries were enriched — surfaced in the job result."""

    llm_ok: int = 0
    llm_fallback: int = 0
    capped: int = 0

    def as_dict(self) -> dict[str, int]:
        return {"llmOk": self.llm_ok, "llmFallback": self.llm_fallback, "capped": self.capped}


class LLMEnricher:
    def __init__(
        self, client: LLMClient, fallback: Enricher, *, max_entries: int | None = None
    ) -> None:
        self._client = client
        self._fallback = fallback
        self._max_entries = max_entries
        self._used = 0
        self._lock = Lock()
        self.stats = EnrichStats()

    def enrich(self, draft: EntryDraft, meta: DocMeta) -> None:
        if not self._claim_budget():
            self._fall_back(draft, meta, "deterministic-cap", capped=True)
            return
        try:
            result = self._enrich_via_llm(draft, meta)
        except (LLMError, ValidationError) as error:
            log.warning("LLM enrich failed for %r; using deterministic: %s", draft.title, error)
            self._fall_back(draft, meta, "llm-fallback")
            return
        if not _is_usable_summary(result.summary, draft):
            log.warning("LLM summary for %r was low-quality; using deterministic", draft.title)
            self._fall_back(draft, meta, "llm-fallback")
            return
        draft.summary = result.summary
        draft.tags = result.tags
        draft.enriched_by = "llm"
        with self._lock:
            self.stats.llm_ok += 1

    def _enrich_via_llm(self, draft: EntryDraft, meta: DocMeta) -> EnrichmentResult:
        breadcrumb = " > ".join(draft.breadcrumb)
        user = f"Source: {meta.title}\nPath: {breadcrumb}\nTitle: {draft.title}\n\n{draft.body_md[:_BODY_EXCERPT_CHARS]}"
        data = self._client.complete_json(system=_SYSTEM_PROMPT, user=user)
        return EnrichmentResult.model_validate(data)

    def _claim_budget(self) -> bool:
        if self._max_entries is None:
            return True
        with self._lock:
            if self._used >= self._max_entries:
                return False
            self._used += 1
            return True

    def _fall_back(self, draft: EntryDraft, meta: DocMeta, label: str, *, capped: bool = False) -> None:
        self._fallback.enrich(draft, meta)
        draft.enriched_by = label  # override the deterministic enricher's own label
        with self._lock:
            if capped:
                self.stats.capped += 1
            else:
                self.stats.llm_fallback += 1
