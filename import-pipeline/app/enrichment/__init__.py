"""Enrichment: fill each entry's summary and tags, behind one swappable `Enricher` seam."""

from app.enrichment.base import Enricher, EnrichmentResult
from app.enrichment.deterministic import DeterministicEnricher
from app.enrichment.factory import make_enricher
from app.enrichment.llm_client import LLMClient, LLMError
from app.enrichment.llm_enricher import EnrichStats, LLMEnricher

__all__ = [
    "DeterministicEnricher",
    "EnrichStats",
    "Enricher",
    "EnrichmentResult",
    "LLMClient",
    "LLMEnricher",
    "LLMError",
    "make_enricher",
]
