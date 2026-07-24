"""Full-text search over a user's artifacts — the agent's window into what they already know."""

from typing import TypedDict
from uuid import UUID

from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import REGCONFIG
from sqlalchemy.orm import Session

from app.db.models import Artifact, Concept

DEFAULT_LIMIT = 8
_LANGUAGE = "english"


class Hit(TypedDict):
    slug: str
    title: str
    summary: str | None
    concept: str


def search_artifacts(
    session: Session, user_id: UUID, query: str, limit: int = DEFAULT_LIMIT
) -> list[Hit]:
    """Rank one user's artifacts against a free-text query."""
    haystack = func.to_tsvector(
        literal(_LANGUAGE, REGCONFIG), func.concat_ws(" ", Artifact.title, Artifact.summary, Artifact.body)
    )
    needle = func.plainto_tsquery(literal(_LANGUAGE, REGCONFIG), query)
    rows = session.execute(
        select(Artifact.slug, Artifact.title, Artifact.summary, Concept.name)
        .join(Concept, Concept.id == Artifact.concept_id)
        .where(Artifact.user_id == user_id, haystack.op("@@")(needle))
        .order_by(func.ts_rank(haystack, needle).desc())
        .limit(limit)
    )
    return [
        {"slug": slug, "title": title, "summary": summary, "concept": concept}
        for slug, title, summary, concept in rows
    ]
