"""Phase 3: hermetic tests for the LLM enrichment path — no network, no real model.

The whole client stack is exercised through httpx.MockTransport with canned/erroring responses,
and the enricher's fallback + budget behavior is asserted directly. The deterministic enricher is
the real one (it must never fail), so a fallback produces a genuine summary.
"""

import json

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.enrichment import (
    DeterministicEnricher,
    EnrichmentResult,
    LLMClient,
    LLMEnricher,
    LLMError,
    make_enricher,
)
from app.enrichment.batch import enrich_drafts
from app.models import DocMeta, EntryDraft, SourceType


def _client(handler, *, max_retries=1):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return LLMClient(base_url="http://model.test/v1", model="m", http=http, max_retries=max_retries)


def _envelope(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def _draft(title="Title", body="A real body paragraph the deterministic enricher can summarize."):
    return EntryDraft(source_key="k", title=title, breadcrumb=["Doc", title], level=1, body_md=body)


_META = DocMeta(title="Doc", source_type=SourceType.DOCS)


# --- EnrichmentResult: parse at the boundary ------------------------------------------------


def test_enrichment_result_cleans_summary_and_tags():
    result = EnrichmentResult.model_validate({"summary": "  Hello.  ", "tags": ["A", "a", "B"]})
    assert result.summary == "Hello."
    assert result.tags == ["a", "b"]  # lowercased, de-duped


def test_enrichment_result_rejects_empty_summary():
    with pytest.raises(ValidationError):
        EnrichmentResult.model_validate({"summary": "", "tags": []})


# --- LLMClient: the one gateway, all failure paths loud -------------------------------------


def test_client_parses_openai_compatible_envelope():
    payload = json.dumps({"summary": "Neat.", "tags": ["x"]})
    data = _client(lambda req: _envelope(payload)).complete_json(system="s", user="u")
    assert data == {"summary": "Neat.", "tags": ["x"]}


def test_client_raises_on_http_error():
    with pytest.raises(LLMError):
        _client(lambda req: httpx.Response(400, text="bad request")).complete_json(system="s", user="u")


def test_client_raises_on_non_json_message_content():
    with pytest.raises(LLMError):
        _client(lambda req: _envelope("this is not json")).complete_json(system="s", user="u")


def test_client_raises_on_unexpected_envelope():
    with pytest.raises(LLMError):
        _client(lambda req: httpx.Response(200, json={"nope": True})).complete_json(system="s", user="u")


def test_client_retries_server_errors_then_raises():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(503, text="overloaded")

    with pytest.raises(LLMError):
        _client(handler, max_retries=2).complete_json(system="s", user="u")
    assert len(calls) == 3  # initial + 2 retries


# --- LLMEnricher: success, loud flagged fallback, budget cap --------------------------------


def test_enricher_success_sets_llm_fields():
    payload = json.dumps({"summary": "What it teaches.", "tags": ["topic"]})
    enricher = LLMEnricher(_client(lambda req: _envelope(payload)), DeterministicEnricher())
    draft = _draft()
    enricher.enrich(draft, _META)
    assert draft.summary == "What it teaches."
    assert draft.tags == ["topic"]
    assert draft.enriched_by == "llm"
    assert enricher.stats.llm_ok == 1


def test_enricher_falls_back_loudly_on_failure():
    enricher = LLMEnricher(_client(lambda req: httpx.Response(500)), DeterministicEnricher())
    draft = _draft()
    enricher.enrich(draft, _META)
    assert draft.enriched_by == "llm-fallback"
    assert draft.summary is not None  # deterministic still produced a real summary
    assert enricher.stats.llm_fallback == 1


def test_enricher_falls_back_on_schema_mismatch():
    payload = json.dumps({"not_summary": 1})  # valid JSON object, wrong shape
    enricher = LLMEnricher(_client(lambda req: _envelope(payload)), DeterministicEnricher())
    draft = _draft()
    enricher.enrich(draft, _META)
    assert draft.enriched_by == "llm-fallback"
    assert enricher.stats.llm_fallback == 1


def test_enricher_respects_budget_cap():
    payload = json.dumps({"summary": "ok", "tags": []})
    enricher = LLMEnricher(
        _client(lambda req: _envelope(payload)), DeterministicEnricher(), max_entries=1
    )
    first, second = _draft("First"), _draft("Second")
    enricher.enrich(first, _META)
    enricher.enrich(second, _META)
    assert first.enriched_by == "llm"
    assert second.enriched_by == "deterministic-cap"
    assert enricher.stats.llm_ok == 1 and enricher.stats.capped == 1


# --- batch + factory ------------------------------------------------------------------------


def test_enrich_drafts_runs_concurrently():
    drafts = [_draft(f"E{i}") for i in range(8)]
    enrich_drafts(drafts, _META, DeterministicEnricher(), max_concurrency=4)
    assert all(d.enriched_by == "deterministic" for d in drafts)
    assert all(d.summary for d in drafts)


def test_make_enricher_defaults_to_deterministic():
    settings = Settings(database_url="postgresql://x/y")
    assert isinstance(make_enricher(settings), DeterministicEnricher)


def test_make_enricher_llm_requires_base_url():
    settings = Settings(database_url="postgresql://x/y", enricher="llm", llm_base_url=None)
    with pytest.raises(ValueError, match="LLM_BASE_URL"):
        make_enricher(settings)


def test_make_enricher_builds_llm_when_configured():
    settings = Settings(
        database_url="postgresql://x/y", enricher="llm", llm_base_url="http://model.test/v1"
    )
    assert isinstance(make_enricher(settings), LLMEnricher)


def test_build_import_threads_llm_enrichment_into_metadata():
    from app.parsing.markdown_parser import parse_markdown
    from app.pipeline import build_import

    payload = json.dumps({"summary": "An LLM-written summary.", "tags": ["graph"]})
    enricher = LLMEnricher(_client(lambda req: _envelope(payload)), DeterministicEnricher())
    doc = parse_markdown(
        "# Doc\n\nA real body paragraph long enough to stand as its own entry in the import.",
        fallback_title="Doc", source_type=SourceType.DOCS,
    )
    mapped = build_import(doc, collection_name="C", scope="c", enricher=enricher)
    assert mapped.entries  # sanity
    assert all(e.metadata.get("enrichedBy") == "llm" for e in mapped.entries)
    assert any(e.summary == "An LLM-written summary." for e in mapped.entries)
