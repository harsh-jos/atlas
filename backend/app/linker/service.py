"""The linker: propose typed edges for newly written artifacts, labelled and reversible."""

import logging
from collections.abc import Sequence
from typing import TypedDict
from uuid import UUID, uuid4

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import Origin
from app.db.models import Artifact, JudgedPair, Relation, User
from app.linker.candidates import candidates_for
from app.linker.embeddings import Embedder, GeminiEmbedder, embed_missing
from app.linker.judge import GeminiJudge, Judge

log = logging.getLogger(__name__)

Pair = tuple[Artifact, Artifact]


class ProposedEdge(TypedDict):
    fromTitle: str
    toTitle: str
    relationType: str
    note: str
    confidence: float


class LinkReport(TypedDict):
    embedded: int
    considered: int
    proposed: int
    capped: bool
    edges: list[ProposedEdge]


class Linker:
    """Deterministic retrieval, judged typing, reversible writes."""

    def __init__(
        self,
        session: Session,
        user: User,
        embedder: Embedder | None = None,
        judge: Judge | None = None,
    ) -> None:
        self.session = session
        self.user = user
        self.settings = get_settings()
        self._embedder = embedder
        self._judge = judge

    @property
    def embedder(self) -> Embedder:
        if self._embedder is None:
            self._embedder = GeminiEmbedder()
        return self._embedder

    @property
    def judge(self) -> Judge:
        if self._judge is None:
            self._judge = GeminiJudge()
        return self._judge

    def propose(self, artifact_ids: Sequence[UUID]) -> LinkReport:
        embedded = embed_missing(
            self.session,
            self.embedder,
            artifact_ids,
            user_id=self.user.id,
            backfill_limit=self.settings.linker_backfill_limit,
        )
        pairs = self._pairs(artifact_ids)
        limit = self.settings.linker_max_pairs
        capped = len(pairs) > limit
        if capped:
            log.info("capping linker pairs at %d of %d for cost", limit, len(pairs))
        pairs = pairs[:limit]

        edges: list[ProposedEdge] = []
        batch = self.settings.linker_batch_size
        for start in range(0, len(pairs), batch):
            edges.extend(self._write(pairs[start : start + batch]))
        return {
            "embedded": embedded,
            "considered": len(pairs),
            "proposed": len(edges),
            "capped": capped,
            "edges": edges,
        }

    def _pairs(self, artifact_ids: Sequence[UUID]) -> list[Pair]:
        """Unordered, deduplicated, and never a pair that already has an edge either way."""
        artifacts = list(
            self.session.scalars(
                select(Artifact).where(
                    Artifact.user_id == self.user.id, Artifact.id.in_(artifact_ids)
                )
            )
        )
        known = self._existing_edges(artifact_ids) | self._already_judged(artifact_ids)
        seen: set[frozenset[UUID]] = set()
        pairs: list[Pair] = []
        for artifact in artifacts:
            for other_id in candidates_for(self.session, artifact, self.settings.linker_neighbours):
                key = frozenset({artifact.id, other_id})
                if len(key) < 2 or key in seen or key in known:
                    continue
                other = self.session.get(Artifact, other_id)
                if other is None or other.user_id != self.user.id:
                    continue
                seen.add(key)
                pairs.append((artifact, other))
        return pairs

    def _already_judged(self, artifact_ids: Sequence[UUID]) -> set[frozenset[UUID]]:
        """Verdicts are remembered, so a rerun converges instead of rolling the dice again."""
        rows = self.session.execute(
            select(JudgedPair.low_id, JudgedPair.high_id).where(
                JudgedPair.user_id == self.user.id,
                or_(JudgedPair.low_id.in_(artifact_ids), JudgedPair.high_id.in_(artifact_ids)),
            )
        ).all()
        return {frozenset({low, high}) for low, high in rows}

    def _remember(self, pairs: Sequence[Pair]) -> None:
        rows = []
        for first, second in pairs:
            low, high = sorted((first.id, second.id), key=str)
            rows.append({"id": uuid4(), "user_id": self.user.id, "low_id": low, "high_id": high})
        if rows:
            self.session.execute(
                insert(JudgedPair)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["user_id", "low_id", "high_id"])
            )

    def _existing_edges(self, artifact_ids: Sequence[UUID]) -> set[frozenset[UUID]]:
        rows = self.session.execute(
            select(Relation.from_id, Relation.to_id).where(
                Relation.user_id == self.user.id,
                or_(Relation.from_id.in_(artifact_ids), Relation.to_id.in_(artifact_ids)),
            )
        ).all()
        return {frozenset({source, target}) for source, target in rows}

    def _write(self, pairs: Sequence[Pair]) -> list[ProposedEdge]:
        floor = self.settings.linker_min_confidence
        judgements = self.judge.type_pairs(pairs)
        self._remember(pairs)
        rows: list[dict] = []
        edges: list[ProposedEdge] = []
        for judgement in judgements:
            if not 0 <= judgement.index < len(pairs) or judgement.confidence < floor:
                continue
            first, second = pairs[judgement.index]
            source, target = (second, first) if judgement.reversed else (first, second)
            edges.append(
                {
                    "fromTitle": source.title,
                    "toTitle": target.title,
                    "relationType": str(judgement.relation_type),
                    "note": judgement.note,
                    "confidence": judgement.confidence,
                }
            )
            rows.append(
                {
                    "id": uuid4(),
                    "user_id": self.user.id,
                    "from_id": source.id,
                    "to_id": target.id,
                    "relation_type": judgement.relation_type,
                    "note": judgement.note,
                    "origin": Origin.AI,
                    "confidence": judgement.confidence,
                }
            )
        if not rows:
            return []
        self.session.execute(
            insert(Relation)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["from_id", "to_id", "relation_type"])
        )
        return edges


def prune_ai_relations(session: Session, user: User) -> int:
    """A bad linker run is one delete away — that is what labelling every edge buys."""
    result = session.execute(
        delete(Relation).where(Relation.user_id == user.id, Relation.origin == Origin.AI)
    )
    return result.rowcount
