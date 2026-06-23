"""Apply an enricher across many drafts, concurrently when the enricher is I/O-bound (LLM).

Each `enrich` call mutates only its own draft, so the work is embarrassingly parallel; the LLM
enricher's shared counters are lock-guarded. A ThreadPoolExecutor (not asyncio) keeps the
sync `Enricher` Protocol unchanged — the calls are network-bound, so threads give the speed-up.

Enrichment is best-effort: the import's core value is the entries and the graph, not the
summaries. So a crash in any enricher (a bad model, a bug) leaves that one entry un-enriched
and is logged — it never sinks the whole import. The pipeline is not built around the LLM.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from app.enrichment.base import Enricher
from app.models import DocMeta, EntryDraft

log = logging.getLogger(__name__)


def _safe_enrich(enricher: Enricher, draft: EntryDraft, meta: DocMeta) -> None:
    try:
        enricher.enrich(draft, meta)
    except Exception:  # last-resort guard: one entry's enrichment must not fail the import
        log.exception("enrichment crashed for %r; leaving it un-enriched", draft.title)


def enrich_drafts(
    drafts: list[EntryDraft],
    meta: DocMeta,
    enricher: Enricher,
    *,
    max_concurrency: int = 1,
) -> None:
    if max_concurrency <= 1 or len(drafts) <= 1:
        for draft in drafts:
            _safe_enrich(enricher, draft, meta)
        return

    with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
        # Drain the iterator so each task runs to completion (errors already contained above).
        for _ in pool.map(lambda draft: _safe_enrich(enricher, draft, meta), drafts):
            pass
