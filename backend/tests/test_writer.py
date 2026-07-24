"""The writer persists imports per user; re-importing must update rather than duplicate."""

import pytest
from sqlalchemy import func, select

from app.core.enums import SourceType
from app.db.models import Artifact, Concept, Relation, Source, User
from app.pipeline.build import build_import
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.writer import ImportWriter, allocate_slug

SAMPLE = """# Vector Search

An overview of searching by meaning rather than by exact keyword matching alone.

## HNSW

Hierarchical navigable small worlds, the index most vector databases reach for by default.

## IVF

Inverted file indexes partition the space into cells and search only the nearest few of them.
"""

TRIMMED = """# Vector Search

An overview of searching by meaning rather than by exact keyword matching alone.

## HNSW

Hierarchical navigable small worlds, the index most vector databases reach for by default.
"""


def _mapped(markdown: str = SAMPLE, name: str = "Vector Search"):
    doc = parse_markdown(markdown, fallback_title=name, source_type=SourceType.DOCS)
    return build_import(doc, concept_name=name, scope="test-scope", min_artifact_chars=1)


@pytest.fixture
def user(session):
    record = User(email="writer@example.com", password_hash="x")
    session.add(record)
    session.flush()
    return record


@pytest.fixture
def other_user(session):
    record = User(email="second@example.com", password_hash="x")
    session.add(record)
    session.flush()
    return record


def _count(session, model, **filters) -> int:
    statement = select(func.count()).select_from(model)
    for column, value in filters.items():
        statement = statement.where(getattr(model, column) == value)
    return session.scalar(statement)


def test_first_import_creates_the_concept_and_its_artifacts(session, user):
    summary = ImportWriter(session, user.id).write(_mapped())

    assert summary["conceptSlug"] == "vector-search"
    assert summary["artifacts"] == _count(session, Artifact, user_id=user.id)
    assert _count(session, Concept, user_id=user.id) == 1
    assert _count(session, Source) == summary["artifacts"]


def test_artifacts_are_stamped_with_the_owner(session, user):
    ImportWriter(session, user.id).write(_mapped())
    assert all(a.user_id == user.id for a in session.scalars(select(Artifact)))


def test_reimport_updates_in_place_instead_of_duplicating(session, user):
    writer = ImportWriter(session, user.id)
    writer.write(_mapped())
    before = {a.meta["sourceKey"]: a.id for a in session.scalars(select(Artifact))}

    writer.write(_mapped())
    after = {a.meta["sourceKey"]: a.id for a in session.scalars(select(Artifact))}

    assert before == after
    assert _count(session, Concept, user_id=user.id) == 1


def test_reimport_prunes_sections_that_vanished(session, user):
    writer = ImportWriter(session, user.id)
    writer.write(_mapped())
    assert any("ivf" in a.slug for a in session.scalars(select(Artifact)))

    summary = writer.write(_mapped(TRIMMED))

    assert summary["pruned"] == 1
    assert not any("ivf" in a.slug for a in session.scalars(select(Artifact)))


def test_reimport_does_not_accumulate_duplicate_sources(session, user):
    writer = ImportWriter(session, user.id)
    writer.write(_mapped())
    first = _count(session, Source)
    writer.write(_mapped())
    assert _count(session, Source) == first


def test_relations_are_not_duplicated_across_imports(session, user):
    writer = ImportWriter(session, user.id)
    writer.write(_mapped())
    first = _count(session, Relation)
    writer.write(_mapped())
    assert _count(session, Relation) == first
    assert first > 0


def test_two_users_importing_the_same_source_stay_separate(session, user, other_user):
    ImportWriter(session, user.id).write(_mapped())
    ImportWriter(session, other_user.id).write(_mapped())

    mine = _count(session, Artifact, user_id=user.id)
    theirs = _count(session, Artifact, user_id=other_user.id)
    assert mine == theirs > 0
    assert _count(session, Concept, user_id=user.id) == 1
    assert _count(session, Concept, user_id=other_user.id) == 1


def test_one_users_reimport_does_not_prune_anothers_artifacts(session, user, other_user):
    ImportWriter(session, user.id).write(_mapped())
    ImportWriter(session, other_user.id).write(_mapped())
    theirs = _count(session, Artifact, user_id=other_user.id)

    ImportWriter(session, user.id).write(_mapped(TRIMMED))

    assert _count(session, Artifact, user_id=other_user.id) == theirs


def test_slug_allocation_suffixes_collisions():
    taken = {"hnsw"}
    assert allocate_slug("HNSW", taken) == "hnsw-1"
    assert allocate_slug("HNSW", taken) == "hnsw-2"
    assert allocate_slug("", taken) == "untitled"
