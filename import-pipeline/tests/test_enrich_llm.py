"""Hermetic tests for the optional LLM enricher — completion fn is faked, no network."""

from app.enrich_llm import LLMEnricher, _parse, enricher_from_settings
from app.config import Settings
from app.models import DocMeta, EntryDraft, SourceType

META = DocMeta(title="Doc", source_type=SourceType.DOCS)


def _draft(title: str, body: str) -> EntryDraft:
    return EntryDraft(source_key=title, title=title, breadcrumb=[title], level=1, body_md=body)


def test_parse_tolerates_code_fences_and_dedupes_tags():
    summary, tags = _parse('```json\n{"summary": "A crisp summary.", "tags": ["A", "a", "b"]}\n```')
    assert summary == "A crisp summary."
    assert tags == ["a", "b"]  # lowercased + de-duplicated


def test_parse_rejects_bad_payloads():
    assert _parse("not json at all") == (None, None)
    assert _parse('["a", "list"]') == (None, None)


def test_parse_missing_or_blank_fields():
    summary, tags = _parse('{"summary": ""}')
    assert summary is None and tags is None


def test_llm_upgrades_largest_entries_and_keeps_baseline():
    calls: list[str] = []

    def fake_complete(system: str, user: str) -> str:
        calls.append(user)
        return '{"summary": "LLM summary.", "tags": ["llm", "tag"]}'

    big = _draft("Big", "x" * 2000)
    small = _draft("Small", "y" * 50)
    enricher = LLMEnricher(fake_complete, max_entries=1)
    enricher.enrich_all([big, small], META)

    # Only the largest entry was sent to the LLM...
    assert len(calls) == 1 and "Big" in calls[0]
    assert big.summary == "LLM summary." and big.tags == ["llm", "tag"]
    # ...the small one keeps its deterministic enrichment (a summary was still assigned).
    assert small.tags  # deterministic tags present


def test_llm_failure_falls_back_to_deterministic():
    def boom(system: str, user: str) -> str:
        raise RuntimeError("network down")

    draft = _draft("Section", "This section explains a real concept in enough words to summarize.")
    LLMEnricher(boom, max_entries=5).enrich_all([draft], META)
    assert draft.summary and draft.tags  # deterministic baseline survived the failure


def test_enricher_from_settings_gating():
    # Off by default regardless of key.
    assert enricher_from_settings(Settings(database_url="x", deepseek_api_key="k")) is None
    # Enabled but no key -> still None (never half-configured).
    assert enricher_from_settings(
        Settings(database_url="x", llm_enrichment=True, deepseek_api_key=None)
    ) is None
    # Enabled + key -> an enricher.
    assert enricher_from_settings(
        Settings(database_url="x", llm_enrichment=True, deepseek_api_key="k")
    ) is not None
