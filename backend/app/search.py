"""Full-text search over a user's artifacts — the agent's window into what they already know."""

from typing import TypedDict
from uuid import UUID

from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import REGCONFIG
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Artifact, Concept



class Hit(TypedDict):
    slug: str
    title: str
    summary: str | None
    concept: str


def search_artifacts(
    session: Session, user_id: UUID, query: str, limit: int | None = None
) -> list[Hit]:
    """Rank one user's artifacts against a free-text query."""
    settings = get_settings()
    haystack = func.to_tsvector(
        literal(settings.search_language, REGCONFIG), func.concat_ws(" ", Artifact.title, Artifact.summary, Artifact.body)
    )
    needle = func.plainto_tsquery(literal(settings.search_language, REGCONFIG), query)
    rows = session.execute(
        select(Artifact.slug, Artifact.title, Artifact.summary, Concept.name)
        .join(Concept, Concept.id == Artifact.concept_id)
        .where(Artifact.user_id == user_id, haystack.op("@@")(needle))
        .order_by(func.ts_rank(haystack, needle).desc())
        .limit(limit or settings.search_limit)
    )
    return [
        {"slug": slug, "title": title, "summary": summary, "concept": concept}
        for slug, title, summary, concept in rows
    ]
