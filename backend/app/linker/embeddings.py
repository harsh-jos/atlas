"""Embedding artifacts, so relatedness can be measured rather than guessed."""

import logging
from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.session import configure_vertex
from app.core.config import EMBEDDING_DIMENSIONS, get_settings
from app.db.models import Artifact

log = logging.getLogger(__name__)
_BATCH = 32


class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


def _unit(vector: Sequence[float]) -> list[float]:
    """Gemini truncates larger embeddings for smaller sizes, so renormalise before comparing."""
    magnitude = sum(value * value for value in vector) ** 0.5
    return [value / magnitude for value in vector] if magnitude else list(vector)


class GeminiEmbedder:
    """The same provider the agent uses, so there is one model client and no extra serving."""

    def __init__(self) -> None:
        configure_vertex()
        self._model = get_settings().embedding_model
        self._client = genai.Client()

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), _BATCH):
            response = self._client.models.embed_content(
                model=self._model,
                contents=list(texts[start : start + _BATCH]),
                config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS),
            )
            vectors.extend(_unit(embedding.values) for embedding in response.embeddings)
        return vectors


def embeddable(artifact: Artifact) -> str:
    """Title carries the concept, summary carries the gist; bodies would drown both."""
    return "\n".join(filter(None, [artifact.title, artifact.summary]))


def embed_missing(
    session: Session,
    embedder: Embedder,
    artifact_ids: Sequence[UUID],
    *,
    user_id: UUID | None = None,
    backfill_limit: int = 0,
) -> int:
    """Embed the given artifacts, plus a bounded slice of the owner's unembedded backlog.

    The backfill matters: a candidate is only reachable by the dense signal once *both* sides
    have a vector, so a knowledge base predating the linker would stay invisible to it.
    """
    statement = select(Artifact).where(Artifact.id.in_(artifact_ids), Artifact.embedding.is_(None))
    pending = list(session.scalars(statement))
    if user_id is not None and backfill_limit:
        already = {artifact.id for artifact in pending}
        backlog = session.scalars(
            select(Artifact)
            .where(Artifact.user_id == user_id, Artifact.embedding.is_(None))
            .limit(backfill_limit)
        )
        pending.extend(artifact for artifact in backlog if artifact.id not in already)
    if not pending:
        return 0
    for artifact, vector in zip(
        pending, embedder.embed([embeddable(a) for a in pending]), strict=True
    ):
        artifact.embedding = vector
    session.flush()
    return len(pending)
