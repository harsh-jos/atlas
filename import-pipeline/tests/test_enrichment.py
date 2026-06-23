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
    payload = json.dumps({"summary": "This entry explains a real, usable concept.", "tags": []})
    enricher = LLMEnricher(
        _client(lambda req: _envelope(payload)), DeterministicEnricher(), max_entries=1
    )
    first, second = _draft("First"), _draft("Second")
    enricher.enrich(first, _META)
    enricher.enrich(second, _META)
    assert first.enriched_by == "llm"
    assert second.enriched_by == "deterministic-cap"
    assert enricher.stats.llm_ok == 1 and enricher.stats.capped == 1


_BAD_MODEL_OUTPUTS = [
    "",
    "   ",
    "not json at all, just chatting",
    "{",
    '{"summary":',
    "{'summary': 'single quotes'}",
    '{"summary": 123, "tags": 456}',
    '{"summary": null, "tags": null}',
    '{"tags": ["a"]}',
    '{"summary": "!!! ??? ..."}',
    '{"summary": "ok"}',
    '{"summary": "Title"}',
    '{"summary": "' + "x" * 50000 + '"}',
    '{"summary": "fine summary text", "tags": ["' + "z" * 5000 + '"]}',
]


@pytest.mark.parametrize("output", _BAD_MODEL_OUTPUTS)
def test_enricher_never_crashes_and_always_summarizes_on_bad_output(output):
    enricher = LLMEnricher(_client(lambda req: _envelope(output)), DeterministicEnricher())
    draft = _draft(title="Title")
    enricher.enrich(draft, _META)  # must not raise
    assert draft.summary and draft.summary.strip()  # always a usable summary (llm or fallback)
    assert all(len(t) <= 40 for t in draft.tags) and len(draft.tags) <= 6


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


# --- Robustness against a bad / small local model -------------------------------------------


def test_client_recovers_json_from_code_fence():
    fenced = "```json\n{\"summary\": \"Fenced.\", \"tags\": [\"a\"]}\n```"
    data = _client(lambda req: _envelope(fenced)).complete_json(system="s", user="u")
    assert data == {"summary": "Fenced.", "tags": ["a"]}


def test_client_recovers_json_embedded_in_prose():
    messy = 'Sure! Here is the JSON you asked for:\n{"summary": "Embedded.", "tags": ["x"]}\nHope that helps!'
    data = _client(lambda req: _envelope(messy)).complete_json(system="s", user="u")
    assert data == {"summary": "Embedded.", "tags": ["x"]}


def test_client_unwraps_single_element_array():
    arr = '[{"summary": "Wrapped in an array.", "tags": []}]'
    data = _client(lambda req: _envelope(arr)).complete_json(system="s", user="u")
    assert data["summary"] == "Wrapped in an array."


def test_client_json_mode_off_omits_response_format():
    seen = {}

    def handler(req):
        seen["body"] = json.loads(req.content)
        return _envelope('{"summary": "ok ok ok ok", "tags": []}')

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = LLMClient(base_url="http://m.test/v1", model="m", http=http, json_mode=False)
    client.complete_json(system="s", user="u")
    assert "response_format" not in seen["body"]


def test_result_coerces_comma_separated_tag_string():
    result = EnrichmentResult.model_validate({"summary": "fine summary here", "tags": "A, b,  C"})
    assert result.tags == ["a", "b", "c"]


def test_result_coerces_non_string_summary():
    result = EnrichmentResult.model_validate({"summary": ["one", "two"], "tags": []})
    assert result.summary == "one two"


def test_result_drops_sentence_length_tags():
    result = EnrichmentResult.model_validate(
        {"summary": "a fine summary", "tags": ["graph", "this is clearly a whole sentence not a tag"]}
    )
    assert result.tags == ["graph"]


def test_enricher_rejects_garbage_summary_and_falls_back():
    # Well-formed JSON, but the summary is mostly punctuation — worse than deterministic.
    payload = json.dumps({"summary": "!!! ??? ...", "tags": ["x"]})
    enricher = LLMEnricher(_client(lambda req: _envelope(payload)), DeterministicEnricher())
    draft = _draft()
    enricher.enrich(draft, _META)
    assert draft.enriched_by == "llm-fallback"
    assert enricher.stats.llm_fallback == 1


def test_enricher_rejects_one_word_summary():
    payload = json.dumps({"summary": "ok", "tags": []})
    enricher = LLMEnricher(_client(lambda req: _envelope(payload)), DeterministicEnricher())
    draft = _draft()
    enricher.enrich(draft, _META)
    assert draft.enriched_by == "llm-fallback"


def test_enricher_rejects_summary_that_just_echoes_title():
    payload = json.dumps({"summary": "Title", "tags": []})
    enricher = LLMEnricher(_client(lambda req: _envelope(payload)), DeterministicEnricher())
    draft = _draft(title="Title")
    enricher.enrich(draft, _META)
    assert draft.enriched_by == "llm-fallback"


def test_import_survives_an_enricher_that_always_crashes():
    # The ultimate guard: even a totally broken enricher must not fail the import.
    class ExplodingEnricher:
        def enrich(self, draft, meta):
            raise RuntimeError("model exploded")

    from app.parsing.markdown_parser import parse_markdown
    from app.pipeline import build_import

    doc = parse_markdown(
        "# Doc\n\nA body paragraph long enough to be its own entry in the import here now.\n\n"
        "## Section\n\nAnother standalone paragraph that should also become its own entry too.",
        fallback_title="Doc", source_type=SourceType.DOCS,
    )
    mapped = build_import(doc, collection_name="C", scope="c", enricher=ExplodingEnricher(),
                          min_entry_chars=10)
    assert len(mapped.entries) >= 2  # import completed despite every enrich call crashing
    assert all(e.summary is None for e in mapped.entries)  # just un-enriched, not failed


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
