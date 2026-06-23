"""Choose the enricher from configuration — the one place that decides deterministic vs LLM.

The pipeline depends on the `Enricher` abstraction; this factory is the only code that knows
which concrete enricher is wired, so adding a new backend never touches the pipeline.
"""

from __future__ import annotations

from app.config import Settings
from app.enrichment.base import Enricher
from app.enrichment.deterministic import DeterministicEnricher
from app.enrichment.llm_client import LLMClient
from app.enrichment.llm_enricher import LLMEnricher


def make_enricher(settings: Settings) -> Enricher:
    if settings.enricher != "llm":
        return DeterministicEnricher()
    if not settings.llm_base_url:
        raise ValueError("ENRICHER=llm requires LLM_BASE_URL to point at the model server")

    client = LLMClient(
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        timeout=settings.llm_timeout_s,
        max_tokens=settings.llm_max_tokens,
        json_mode=settings.llm_json_mode,
    )
    return LLMEnricher(
        client,
        DeterministicEnricher(),
        max_entries=settings.llm_max_entries,
        body_excerpt_chars=settings.llm_body_excerpt_chars,
    )
