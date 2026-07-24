"""Full-text search over a user's artifacts — the agent's window into what they already know."""

from datetime import datetime
from typing import TypedDict
from uuid import UUID

from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import REGCONFIG
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Artifact, Concept, Source


_HEADLINE = "StartSel=,StopSel=,MaxWords=30,MinWords=14,MaxFragments=1"


class Hit(TypedDict):
    slug: str
    title: str
    summary: str | None
    concept: str
    concept_color: str | None
    tags: list[str]
    source_count: int
    updated_at: datetime
    excerpt: str | None


def search_artifacts(
    session: Session, user_id: UUID, query: str, limit: int | None = None
) -> list[Hit]:
    """Rank one user's artifacts against a free-text query."""
    settings = get_settings()
    language = literal(settings.search_language, REGCONFIG)
    body = func.concat_ws(" ", Artifact.title, Artifact.summary, Artifact.body)
    haystack = func.to_tsvector(language, body)
    needle = func.plainto_tsquery(language, query)
    # Postgres builds the snippet around the match, so the reader sees why a result matched.
    excerpt = func.ts_headline(language, body, needle, _HEADLINE)
    sources = (
        select(func.count())
        .select_from(Source)
        .where(Source.artifact_id == Artifact.id)
        .scalar_subquery()
    )
    rows = session.execute(
        select(
            Artifact.slug,
            Artifact.title,
            Artifact.summary,
            Concept.name,
            Concept.color,
            Artifact.tags,
            sources,
            Artifact.updated_at,
            excerpt,
        )
        .join(Concept, Concept.id == Artifact.concept_id)
        .where(Artifact.user_id == user_id, haystack.op("@@")(needle))
        .order_by(func.ts_rank(haystack, needle).desc())
        .limit(limit or settings.search_limit)
    )
    return [
        {
            "slug": slug,
            "title": title,
            "summary": summary,
            "concept": concept,
            "concept_color": color,
            "tags": list(tags or []),
            "source_count": source_count,
            "updated_at": updated_at,
            "excerpt": snippet,
        }
        for slug, title, summary, concept, color, tags, source_count, updated_at, snippet in rows
    ]
