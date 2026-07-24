"""Ownership scoping is all that separates two users' knowledge bases — attack it directly."""

import pytest

from app.db.models import Concept, User
from app.db.repository import NotOwned, OwnedRepository


class ConceptRepository(OwnedRepository[Concept]):
    model = Concept


@pytest.fixture
def users(session):
    owner = User(email="owner@example.com", password_hash="x")
    other = User(email="other@example.com", password_hash="x")
    session.add_all([owner, other])
    session.flush()
    return owner, other


def test_add_stamps_the_owner(session, users):
    owner, _ = users
    concept = ConceptRepository(session, owner.id).add(Concept(name="Vectors", slug="vectors"))
    assert concept.user_id == owner.id


def test_list_is_scoped_to_the_owner(session, users):
    owner, other = users
    ConceptRepository(session, owner.id).add(Concept(name="Mine", slug="mine"))
    assert [c.name for c in ConceptRepository(session, owner.id).list()] == ["Mine"]
    assert ConceptRepository(session, other.id).list() == []


def test_get_does_not_cross_users(session, users):
    owner, other = users
    mine = ConceptRepository(session, owner.id).add(Concept(name="Mine", slug="mine"))
    assert ConceptRepository(session, owner.id).get(mine.id) is not None
    assert ConceptRepository(session, other.id).get(mine.id) is None


def test_delete_refuses_another_users_row(session, users):
    owner, other = users
    mine = ConceptRepository(session, owner.id).add(Concept(name="Mine", slug="mine"))
    with pytest.raises(NotOwned):
        ConceptRepository(session, other.id).delete(mine)
