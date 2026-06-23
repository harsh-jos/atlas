"""Apply an enricher across many drafts, concurrently when the enricher is I/O-bound (LLM).

Each `enrich` call mutates only its own draft, so the work is embarrassingly parallel; the LLM
enricher's shared counters are lock-guarded. A ThreadPoolExecutor (not asyncio) keeps the
sync `Enricher` Protocol unchanged — the calls are network-bound, so threads give the speed-up.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from app.enrichment.base import Enricher
from app.models import DocMeta, EntryDraft


def enrich_drafts(
    drafts: list[EntryDraft],
    meta: DocMeta,
    enricher: Enricher,
    *,
    max_concurrency: int = 1,
) -> None:
    if max_concurrency <= 1 or len(drafts) <= 1:
        for draft in drafts:
            enricher.enrich(draft, meta)
        return

    with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
        # Drain the iterator so any exception surfaces instead of being swallowed by the pool.
        for _ in pool.map(lambda draft: enricher.enrich(draft, meta), drafts):
            pass
