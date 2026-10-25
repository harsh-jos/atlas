"""Focused checks for new persistence, ownership, grounding, and worker boundaries."""
import asyncio
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.agent.response import document
from app.agent.turns import TurnStore
from app.agent.stream import events
from app.db.models import AgentTurn, Concept, ConceptConnection, ConceptMention, ConceptRevision


def test_components_preserve_order_and_hide_invalid_or_partial_payloads():
    text = 'Before\n```atlas\n{"type":"plot","title":"Square","fallback":"The output is x squared.","coefficients":[0,0,1],"xMin":-2,"xMax":2}\n```\nAfter'
    parsed = document(text)
    assert [b['type'] for b in parsed['blocks']] == ['markdown', 'component', 'markdown']
    assert parsed['blocks'][1]['id'] == 'b1'
    assert document('Text\n```atlas\nprivate-partial-json')['fallbackText'] == 'Text\n'
    invalid = text.replace('"xMax":2', '"xMax":-3')
    assert 'component' not in [b['type'] for b in document(invalid)['blocks']]
    assert 'x squared' in document(invalid)['fallbackText']


def test_stream_disconnect_does_not_own_or_cancel_generation(usage_factory):
    store = TurnStore(usage_factory().scope)
    owner = usage_factory().user_id
    accepted = store.submit(owner, 's1', uuid4(), 'Explain a graph.')
    claimed = store.claim(900, accepted['id'], owner)
    async def run():
        stream = events(store, owner, accepted['id'], None, lambda row, tools: {'type': 'turn.snapshot', 'status': row['status']})
        first = await anext(stream)
        assert 'running' in first
        await stream.aclose()
    asyncio.run(run())
    assert store.get(owner, accepted['id'])['status'] == 'running'
    wrong_worker = TurnStore(store.scope, uuid4())
    wrong_worker.finish(accepted['id'], 'completed', reply='stale')
    assert store.get(owner, accepted['id'])['status'] == 'running'
    TurnStore(store.scope, claimed['execution_token']).finish(accepted['id'], 'completed', reply='Useful explanation.')
    assert store.get(owner, accepted['id'])['status'] == 'completed'


def test_extraction_commits_only_exact_evidence_and_is_idempotent(usage_factory):
    from app.agent.enrichment import apply, Extraction, Idea, Evidence
    store = TurnStore(usage_factory().scope)
    owner = usage_factory().user_id
    with store.scope() as session:
        for model in (Concept, ConceptConnection, ConceptMention, ConceptRevision):
            model.__table__.create(session.get_bind())
    accepted = store.submit(owner, 's1', uuid4(), 'What does a graph record?')
    store.claim(900, accepted['id'], owner)
    answer = 'A computation graph records mathematical operations and the dependencies between their inputs and outputs.'
    store.finish(accepted['id'], 'completed', reply=answer)
    token = uuid4()
    with store.scope() as session:
        turn = session.get(AgentTurn, accepted['id'])
        turn.enrichment_status, turn.enrichment_token = 'running', token
    overview = answer + ' For example, multiplying an input before adding a constant creates two dependent operations.'
    extraction = Extraction(concepts=[
        Idea(name='Computation graph', description=answer, overview=overview, evidence=[Evidence(block_id='b0', excerpt=answer)]),
        Idea(name='Unsupported idea', description=answer, overview=overview, evidence=[Evidence(block_id='b0', excerpt='This phrase never appeared in the explanation.')]),
    ])
    apply(store.scope, owner, accepted['id'], extraction, [], token)
    apply(store.scope, owner, accepted['id'], extraction, [], token)
    with store.scope() as session:
        concepts = session.scalars(select(Concept)).all()
        assert len(concepts) == 1 and concepts[0].overview == overview
        assert len(session.scalars(select(ConceptMention)).all()) == 1
        assert len(session.scalars(select(ConceptRevision)).all()) == 1


def test_image_modality_is_priced_without_double_counting(usage_factory, agent_settings):
    from app.db.models import AgentRequest
    store = usage_factory()
    request = store.reserve('image-turn', 'gemini-3.1-flash-image', False, agent_settings)
    store.record(request, agent_settings, reported=True, input_tokens=100, output_tokens=1120, output_image_tokens=1120, thought_tokens=0, total_tokens=1220)
    with store.scope() as session:
        # 100 input tokens at $0.50/M plus 1120 image tokens at $60/M.
        assert session.get(AgentRequest, request).estimated_cost_microusd == 67250


def test_enrichment_uses_small_vertex_schema_and_still_enforces_limits(usage_factory, agent_settings, monkeypatch):
    from app.agent import enrichment
    store = TurnStore(usage_factory().scope)
    owner = usage_factory().user_id
    with store.scope() as session:
        for model in (Concept, ConceptConnection, ConceptMention, ConceptRevision):
            model.__table__.create(session.get_bind())
    accepted = store.submit(owner, 's1', uuid4(), 'What is a computation graph?')
    store.claim(900, accepted['id'], owner)
    answer = 'A computation graph records mathematical operations and the dependencies between their inputs and outputs.'
    store.finish(accepted['id'], 'completed', reply=answer)
    idea = dict(name='Computation graph', description=answer, overview=answer,
                evidence=[dict(block_id='b0', excerpt=answer)])

    async def generate(store, invocation, model, contents, config):
        assert config.response_schema is None
        schema = config.response_json_schema
        assert 'maxItems' not in json.dumps(schema)
        assert 'minItems' not in json.dumps(schema)
        assert schema['$defs']['Idea']['properties']['evidence']['items']['$ref'] == '#/$defs/Evidence'
        assert 'at most 12' in schema['properties']['concepts']['description']
        assert config.automatic_continuation is False
        return SimpleNamespace(text=json.dumps(dict(concepts=[idea])))

    monkeypatch.setattr(enrichment, 'get_settings', lambda: agent_settings)
    monkeypatch.setattr(enrichment, 'generate', generate)
    asyncio.run(enrichment.enrich(store.scope, owner, accepted['id']))
    with store.scope() as session:
        assert session.get(AgentTurn, accepted['id']).enrichment_status == 'completed'
        assert len(session.scalars(select(Concept)).all()) == 1
    # Provider grammar relaxation must never relax application validation.
    with pytest.raises(ValidationError):
        enrichment.Extraction.model_validate(dict(concepts=[idea] * 13))
    with pytest.raises(ValidationError):
        enrichment.Extraction.model_validate(dict(concepts=[dict(idea, evidence=[])]))
