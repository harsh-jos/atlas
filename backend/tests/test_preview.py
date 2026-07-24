"""Curation is the product's spine: selecting a subset must not corrupt the graph."""

import pytest
from sqlalchemy import func, select

from app.core.enums import SourceType
from app.db.models import Artifact, Preview, Relation, User
from app.pipeline.build import build_import
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.preview import PreviewService, UnknownPreview, select_artifacts
from app.pipeline.serialization import dump_import, load_import

SAMPLE = """# Vector Search

An overview of searching by meaning rather than by exact keyword matching alone.

## HNSW

Hierarchical navigable small worlds, the index most vector databases reach for by default.

## IVF

Inverted file indexes partition the space into cells and search only the nearest few of them.

## PQ

Product quantisation compresses vectors into codes so far more of them fit in memory at once.
"""


def _mapped(markdown: str = SAMPLE, name: str = "Vector Search"):
    doc = parse_markdown(markdown, fallback_title=name, source_type=SourceType.DOCS)
    return build_import(doc, concept_name=name, scope="test-scope", min_artifact_chars=1)


@pytest.fixture
def user(session):
    record = User(email="curator@example.com", password_hash="x")
    session.add(record)
    session.flush()
    return record


@pytest.fixture
def service(session, user):
    return PreviewService(session, user)


def _keys(mapped) -> list[str]:
    return [a.source_key for a in mapped.artifacts]


def _count(session, model, **filters) -> int:
    statement = select(func.count()).select_from(model)
    for column, value in filters.items():
        statement = statement.where(getattr(model, column) == value)
    return session.scalar(statement)


def test_serialisation_round_trips(session):
    mapped = _mapped()
    restored = load_import(dump_import(mapped))
    assert _keys(restored) == _keys(mapped)
    assert restored.concept.name == mapped.concept.name
    assert [r.relation_type for r in restored.relations] == [
        r.relation_type for r in mapped.relations
    ]


def test_parking_writes_nothing_to_the_knowledge_base(session, service, user):
    service.park(_mapped(), scope="test-scope")
    assert _count(session, Artifact, user_id=user.id) == 0
    assert _count(session, Preview, user_id=user.id) == 1


def test_outline_describes_every_artifact_the_source_offers(session, service):
    preview = service.park(_mapped(), scope="test-scope")
    outline = service.outline(preview.id)
    assert len(outline) == len(_mapped().artifacts)
    assert all(item["bytes"] > 0 for item in outline)
    assert all(item["title"] for item in outline)


def test_committing_everything_writes_everything(session, service, user):
    preview = service.park(_mapped(), scope="test-scope")
    summary = service.commit(preview.id)
    assert summary["artifacts"] == _count(session, Artifact, user_id=user.id)
    assert _count(session, Preview, user_id=user.id) == 0


def test_committing_a_subset_writes_only_the_selection(session, service, user):
    mapped = _mapped()
    preview = service.park(mapped, scope="test-scope")
    chosen = _keys(mapped)[:2]

    summary = service.commit(preview.id, chosen)

    assert summary["artifacts"] == 2
    assert _count(session, Artifact, user_id=user.id) == 2


def test_a_subset_never_writes_an_edge_to_an_excluded_artifact(session, service, user):
    mapped = _mapped()
    preview = service.park(mapped, scope="test-scope")

    service.commit(preview.id, _keys(mapped)[:2])

    written = {a.id for a in session.scalars(select(Artifact))}
    for relation in session.scalars(select(Relation)):
        assert relation.from_id in written
        assert relation.to_id in written


def test_selection_drops_edges_pointing_outside_the_cut():
    mapped = _mapped()
    trimmed = select_artifacts(mapped, _keys(mapped)[:1])
    surviving = {a.source_key for a in trimmed.artifacts}
    assert all(
        r.from_key in surviving and r.to_key in surviving for r in trimmed.relations
    )


def test_committing_a_later_subset_keeps_earlier_choices(session, service, user):
    """The bug this guards: pruning must compare against the source, not the selection."""
    mapped = _mapped()
    keys = _keys(mapped)

    first = service.park(mapped, scope="test-scope")
    service.commit(first.id, keys[:2])
    assert _count(session, Artifact, user_id=user.id) == 2

    second = service.park(_mapped(), scope="test-scope")
    service.commit(second.id, keys[2:3])

    assert _count(session, Artifact, user_id=user.id) == 3


def test_an_unknown_preview_is_refused(service):
    from uuid import uuid4

    with pytest.raises(UnknownPreview):
        service.commit(uuid4())


def test_one_user_cannot_commit_anothers_preview(session, service, user):
    intruder = User(email="intruder@example.com", password_hash="x")
    session.add(intruder)
    session.flush()
    preview = service.park(_mapped(), scope="test-scope")

    with pytest.raises(UnknownPreview):
        PreviewService(session, intruder).commit(preview.id)
