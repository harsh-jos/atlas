"""Curation is the product's spine: selecting a subset must not corrupt the graph."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.core.enums import SourceType
from app.db.models import Artifact, Concept, Preview, Relation, User
from app.pipeline.build import build_import
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.preview import (
    PreviewService,
    UnknownConcept,
    UnknownPreview,
    select_artifacts,
    sweep_expired_previews,
)
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


def _mapped(markdown: str = SAMPLE, name: str = "Vector Search", scope: str = "test-scope"):
    doc = parse_markdown(markdown, fallback_title=name, source_type=SourceType.DOCS)
    return build_import(doc, concept_name=name, scope=scope, min_artifact_chars=1)


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
    assert all(r.from_key in surviving and r.to_key in surviving for r in trimmed.relations)


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
    with pytest.raises(UnknownPreview):
        service.commit(uuid4())


def test_one_user_cannot_commit_anothers_preview(session, service, user):
    intruder = User(email="intruder@example.com", password_hash="x")
    session.add(intruder)
    session.flush()
    preview = service.park(_mapped(), scope="test-scope")

    with pytest.raises(UnknownPreview):
        PreviewService(session, intruder).commit(preview.id)


def _age(session, preview, minutes: int) -> None:
    session.execute(
        update(Preview)
        .where(Preview.id == preview.id)
        .values(created_at=datetime.now(UTC) - timedelta(minutes=minutes))
    )
    session.expire_all()


def test_an_expired_preview_is_refused(session, service, user):
    preview = service.park(_mapped(), scope="test-scope")
    _age(session, preview, get_settings().preview_ttl_minutes + 1)

    with pytest.raises(UnknownPreview):
        service.commit(preview.id)
    assert _count(session, Artifact, user_id=user.id) == 0


def test_a_fresh_preview_is_still_committable(session, service, user):
    preview = service.park(_mapped(), scope="test-scope")
    _age(session, preview, 1)
    assert service.commit(preview.id)["artifacts"] > 0


def test_the_sweep_removes_only_expired_previews(session, service, user):
    stale = service.park(_mapped(), scope="stale-scope")
    fresh = service.park(_mapped(name="Kept"), scope="fresh-scope")
    _age(session, stale, get_settings().preview_ttl_minutes + 1)

    assert sweep_expired_previews(session) == 1
    assert _count(session, Preview, user_id=user.id) == 1
    assert service.previews.get(fresh.id) is not None


def _concept(session, user, name: str) -> Concept:
    return session.scalars(
        select(Concept).where(Concept.user_id == user.id, Concept.name == name)
    ).one()


def test_committing_into_an_existing_concept_extends_it_and_keeps_its_name(session, service, user):
    service.commit(service.park(_mapped(name="Search Indexes", scope="first"), scope="first").id)
    home = _concept(session, user, "Search Indexes")

    proposal = _mapped(name="Vector Search", scope="second")
    preview = service.park(proposal, scope="second")
    summary = service.commit(preview.id, concept_id=home.id)

    assert summary["conceptSlug"] == home.slug
    assert summary["conceptName"] == "Search Indexes"
    assert _count(session, Concept, user_id=user.id) == 1
    assert _count(session, Artifact, concept_id=home.id) == len(proposal.artifacts) * 2


def test_committing_under_a_new_name_creates_that_concept(session, service, user):
    preview = service.park(_mapped(name="Vector Search"), scope="test-scope")
    summary = service.commit(preview.id, concept_name="Retrieval")

    assert summary["conceptName"] == "Retrieval"
    assert summary["conceptSlug"] == "retrieval"
    assert _count(session, Concept, user_id=user.id) == 1


def test_committing_under_a_name_already_in_use_extends_that_concept(session, service, user):
    service.commit(service.park(_mapped(name="Retrieval"), scope="first").id)
    preview = service.park(_mapped(name="Vector Search"), scope="second")

    service.commit(preview.id, concept_name="retrieval")

    assert _count(session, Concept, user_id=user.id) == 1


def test_a_commit_cannot_land_in_another_users_concept(session, service, user):
    intruder = User(email="intruder@example.com", password_hash="x")
    session.add(intruder)
    session.flush()
    theirs = PreviewService(session, intruder)
    theirs.commit(theirs.park(_mapped(name="Theirs"), scope="theirs").id)
    preview = service.park(_mapped(), scope="test-scope")

    with pytest.raises(UnknownConcept):
        service.commit(preview.id, concept_id=_concept(session, intruder, "Theirs").id)
    assert _count(session, Preview, user_id=user.id) == 1


def test_existing_concept_is_matched_by_the_proposed_name(session, service, user):
    assert service.existing_concept(service.park(_mapped(), scope="a").id) is None
    service.commit(service.park(_mapped(name="vector search"), scope="b").id)

    preview = service.park(_mapped(name="Vector Search"), scope="c")
    found = service.existing_concept(preview.id)
    assert found is not None and found.slug == "vector-search"
