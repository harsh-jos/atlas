"""The linker proposes edges. It must be generous, bounded, labelled, and reversible."""

from collections.abc import Sequence

import pytest
from sqlalchemy import func, select

from app.core.config import EMBEDDING_DIMENSIONS, get_settings
from app.core.enums import Origin, RelationType
from app.db.models import Artifact, Concept, Relation, User
from app.linker.candidates import RRF_K, candidates_for, fuse
from app.linker.judge import Judgement
from app.linker.service import Linker, prune_ai_relations

TOPICS = {
    "BM25": "A lexical ranking function rewarding rare query terms over common ones.",
    "Dense embeddings": "Vectors placing passages of similar meaning near one another.",
    "HNSW": "A layered proximity graph, the index vector databases reach for by default.",
    "Tokenisation": "Splitting text into the units a model actually consumes.",
}


class FakeEmbedder:
    """Deterministic vectors: same first letter, similar direction."""

    def __init__(self) -> None:
        self.calls = 0

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        self.calls += 1
        vectors = []
        for text in texts:
            vector = [0.0] * EMBEDDING_DIMENSIONS
            vector[ord(text[0].lower()) % EMBEDDING_DIMENSIONS] = 1.0
            vectors.append(vector)
        return vectors


class FakeJudge:
    """Types the first pair of every batch and refuses the rest, like a sceptical reviewer."""

    def __init__(self, confidence: float = 0.9, relation=RelationType.PREREQUISITE) -> None:
        self.batches: list[int] = []
        self._confidence = confidence
        self._relation = relation

    def type_pairs(self, pairs) -> list[Judgement]:
        self.batches.append(len(pairs))
        if not pairs:
            return []
        return [
            Judgement(
                index=0,
                relation_type=self._relation,
                confidence=self._confidence,
                note="one leads to the other",
            )
        ]


@pytest.fixture
def user(session):
    record = User(email="linker@example.com", password_hash="x")
    session.add(record)
    session.flush()
    return record


@pytest.fixture
def artifacts(session, user):
    concept = Concept(user_id=user.id, name="Retrieval", slug="retrieval")
    session.add(concept)
    session.flush()
    rows = [
        Artifact(
            user_id=user.id,
            concept_id=concept.id,
            title=title,
            slug=title.lower().replace(" ", "-"),
            summary=summary,
            body=summary,
        )
        for title, summary in TOPICS.items()
    ]
    session.add_all(rows)
    session.flush()
    return rows


def _count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def test_rank_fusion_rewards_agreement_across_signals():
    """b is mid-ranked everywhere; a tops one list only. Agreement should win."""
    fused = fuse([["a", "b"], ["b", "c"], ["b", "d"]], 3)
    assert fused[0] == "b"


def test_rank_fusion_uses_ranks_not_scores():
    top = fuse([["x"]], 1)
    assert top == ["x"]
    assert RRF_K == 60


def test_embeddings_are_filled_in_once(session, user, artifacts):
    embedder = FakeEmbedder()
    report = Linker(session, user, embedder, FakeJudge()).propose([a.id for a in artifacts])
    assert report["embedded"] == len(artifacts)

    again = Linker(session, user, embedder, FakeJudge()).propose([a.id for a in artifacts])
    assert again["embedded"] == 0, "an artifact should not be re-embedded"


def test_proposed_edges_are_labelled_and_scored(session, user, artifacts):
    Linker(session, user, FakeEmbedder(), FakeJudge()).propose([a.id for a in artifacts])
    edges = list(session.scalars(select(Relation)))
    assert edges
    assert all(edge.origin == Origin.AI for edge in edges)
    assert all(edge.confidence and edge.confidence > 0 for edge in edges)
    assert all(edge.note for edge in edges)


def test_low_confidence_edges_are_refused(session, user, artifacts):
    floor = get_settings().linker_min_confidence
    judge = FakeJudge(confidence=floor - 0.2)
    Linker(session, user, FakeEmbedder(), judge).propose([a.id for a in artifacts])
    assert _count(session, Relation) == 0


def test_reversed_judgements_flip_the_edge(session, user, artifacts):
    class Reversing(FakeJudge):
        def type_pairs(self, pairs):
            if not pairs:
                return []
            return [
                Judgement(
                    index=0,
                    relation_type=RelationType.PREREQUISITE,
                    reversed=True,
                    confidence=0.9,
                    note="the other way round",
                )
            ]

    Linker(session, user, FakeEmbedder(), Reversing()).propose([artifacts[0].id])
    edge = session.scalars(select(Relation)).first()
    assert edge is not None
    assert edge.to_id == artifacts[0].id, "reversed=true should point back at the source artifact"


def test_an_existing_edge_is_never_re_proposed(session, user, artifacts):
    session.add(
        Relation(
            user_id=user.id,
            from_id=artifacts[0].id,
            to_id=artifacts[1].id,
            relation_type=RelationType.SEE_ALSO,
            origin=Origin.HUMAN,
        )
    )
    session.flush()

    class Spy(FakeJudge):
        def __init__(self):
            super().__init__()
            self.seen: list[tuple] = []

        def type_pairs(self, pairs):
            self.seen.extend((a.id, b.id) for a, b in pairs)
            return []

    spy = Spy()
    Linker(session, user, FakeEmbedder(), spy).propose([artifacts[0].id])
    assert all({a, b} != {artifacts[0].id, artifacts[1].id} for a, b in spy.seen)


def test_typing_is_batched_and_capped(session, user, artifacts, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "linker_max_pairs", 2)
    monkeypatch.setattr(settings, "linker_batch_size", 1)

    judge = FakeJudge()
    report = Linker(session, user, FakeEmbedder(), judge).propose([a.id for a in artifacts])

    assert report["considered"] <= 2
    assert all(size <= 1 for size in judge.batches), "batches must respect the configured size"


def test_a_linker_run_is_one_delete_away(session, user, artifacts):
    session.add(
        Relation(
            user_id=user.id,
            from_id=artifacts[2].id,
            to_id=artifacts[3].id,
            relation_type=RelationType.SEE_ALSO,
            origin=Origin.HUMAN,
            note="drawn by hand",
        )
    )
    session.flush()
    Linker(session, user, FakeEmbedder(), FakeJudge()).propose([a.id for a in artifacts])
    assert _count(session, Relation) > 1

    removed = prune_ai_relations(session, user)

    assert removed >= 1
    survivors = list(session.scalars(select(Relation)))
    assert [edge.note for edge in survivors] == ["drawn by hand"], "hand-drawn edges must survive"


def test_candidates_never_leave_the_owner(session, user, artifacts):
    intruder = User(email="intruder@example.com", password_hash="x")
    session.add(intruder)
    session.flush()
    other_concept = Concept(user_id=intruder.id, name="Retrieval", slug="retrieval")
    session.add(other_concept)
    session.flush()
    session.add(
        Artifact(
            user_id=intruder.id,
            concept_id=other_concept.id,
            title="BM25",
            slug="bm25",
            summary=TOPICS["BM25"],
            body=TOPICS["BM25"],
        )
    )
    session.flush()

    mine = {a.id for a in artifacts}
    found = candidates_for(session, artifacts[0], 10)
    assert set(found) <= mine


def test_a_rerun_on_an_unchanged_base_proposes_nothing_new(session, user, artifacts):
    """Without remembering verdicts the linker ratchets, saturating the graph over reruns."""
    ids = [a.id for a in artifacts]
    first = Linker(session, user, FakeEmbedder(), FakeJudge()).propose(ids)
    assert first["proposed"] > 0
    settled = _count(session, Relation)

    second = Linker(session, user, FakeEmbedder(), FakeJudge()).propose(ids)

    assert second["considered"] == 0, "every pair was already judged"
    assert _count(session, Relation) == settled


def test_the_report_names_the_edges_it_proposed(session, user, artifacts):
    """A count alone is not reviewable; the UI has to show what was actually connected."""
    report = Linker(session, user, FakeEmbedder(), FakeJudge()).propose([a.id for a in artifacts])

    assert len(report["edges"]) == report["proposed"]
    edge = report["edges"][0]
    titles = set(TOPICS)
    assert edge["fromTitle"] in titles and edge["toTitle"] in titles
    assert edge["relationType"] == RelationType.PREREQUISITE
    assert edge["note"] and 0 < edge["confidence"] <= 1
