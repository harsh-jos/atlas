"""Candidate pairs from several signals with complementary failure modes, fused by rank.

Cosine distance measures textual likeness, not relatedness — the two come apart exactly where
Atlas cares most, since a prerequisite usually reads nothing like what it unlocks. So no signal
here is trusted alone; each contributes a ranking and RRF combines them.
"""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import REGCONFIG
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Artifact, Relation, Source

RRF_K = 60


def _scope(user_id: UUID, exclude: UUID):
    return select(Artifact.id).where(Artifact.user_id == user_id, Artifact.id != exclude)


def lexical_neighbours(session: Session, artifact: Artifact, limit: int) -> list[UUID]:
    """Rare terms, identifiers and acronyms — exactly what embeddings smooth away."""
    language = literal(get_settings().search_language, REGCONFIG)
    query = func.plainto_tsquery(language, f"{artifact.title} {artifact.summary or ''}")
    document = func.to_tsvector(
        language, func.concat_ws(" ", Artifact.title, Artifact.summary, Artifact.body)
    )
    return list(
        session.scalars(
            _scope(artifact.user_id, artifact.id)
            .where(document.op("@@")(query))
            .order_by(func.ts_rank(document, query).desc())
            .limit(limit)
        )
    )


def dense_neighbours(session: Session, artifact: Artifact, limit: int) -> list[UUID]:
    """Topical relatedness with no shared vocabulary."""
    if artifact.embedding is None:
        return []
    return list(
        session.scalars(
            _scope(artifact.user_id, artifact.id)
            .where(Artifact.embedding.is_not(None))
            .order_by(Artifact.embedding.cosine_distance(artifact.embedding))
            .limit(limit)
        )
    )


def shared_source_neighbours(session: Session, artifact: Artifact, limit: int) -> list[UUID]:
    """Two artifacts citing the same source are related — a poor-man's citation graph."""
    cited = select(Source.url).where(Source.artifact_id == artifact.id, Source.url.is_not(None))
    return list(
        session.scalars(
            _scope(artifact.user_id, artifact.id)
            .join(Source, Source.artifact_id == Artifact.id)
            .where(Source.url.in_(cited))
            .distinct()
            .limit(limit)
        )
    )


def graph_neighbours(session: Session, artifact: Artifact, limit: int) -> list[UUID]:
    """Common neighbours: free, and it sharpens as the graph grows. Useless cold."""
    adjacent = (
        select(Relation.to_id)
        .where(Relation.from_id == artifact.id)
        .union(select(Relation.from_id).where(Relation.to_id == artifact.id))
    )
    reachable = (
        select(Relation.to_id)
        .where(Relation.from_id.in_(adjacent))
        .union(select(Relation.from_id).where(Relation.to_id.in_(adjacent)))
    )
    return list(
        session.scalars(
            _scope(artifact.user_id, artifact.id).where(Artifact.id.in_(reachable)).limit(limit)
        )
    )


def fuse(rankings: Sequence[Sequence[UUID]], limit: int) -> list[UUID]:
    """Reciprocal rank fusion: ranks, not scores, so incompatible scales never need calibrating."""
    scores: dict[UUID, float] = {}
    for ranking in rankings:
        for position, candidate in enumerate(ranking):
            scores[candidate] = scores.get(candidate, 0.0) + 1.0 / (RRF_K + position + 1)
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    return [candidate for candidate, _ in ranked[:limit]]


def candidates_for(session: Session, artifact: Artifact, limit: int) -> list[UUID]:
    """Every signal proposes; rank fusion decides. Generous, because a human prunes."""
    return fuse(
        [
            lexical_neighbours(session, artifact, limit),
            dense_neighbours(session, artifact, limit),
            shared_source_neighbours(session, artifact, limit),
            graph_neighbours(session, artifact, limit),
        ],
        limit,
    )
