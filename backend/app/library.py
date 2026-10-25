"""Reading one user's knowledge base: the queries behind every page the frontend renders."""

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import Select, asc, desc, func, select, literal, union_all
from sqlalchemy.orm import Session, selectinload

from app.db.models import Artifact, Concept, ConceptConnection, Relation, Source, ConceptMention, AgentTurn

Sort = Literal["created_asc", "created_desc", "updated_desc", "title_asc"]

_SORTS = {
    "created_asc": asc(Artifact.created_at),
    "created_desc": desc(Artifact.created_at),
    "updated_desc": desc(Artifact.updated_at),
    "title_asc": asc(Artifact.title),
}
DEFAULT_PAGE_SIZE = 20
MAX_TAGS = 40
_FALLBACK_COLOUR = "#888888"


@dataclass(slots=True)
class ConceptPage:
    concept: Concept
    artifacts: list[Any]
    tags: list[str]
    total_tags: int
    matched: int  # rows matching the current tag filter
    total: int  # every artifact in the concept, filter ignored
    page_size: int


def _owned(model: type, user_id: UUID) -> Select:
    return select(model).where(model.user_id == user_id)


def list_concepts(session: Session, user_id: UUID, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """Every concept with its size and most recently touched artifact."""
    counts = (
        select(Artifact.concept_id, func.count().label("count"))
        .where(Artifact.user_id == user_id).group_by(Artifact.concept_id).subquery()
    )
    latest = (
        select(
            Artifact.concept_id, Artifact.title,
            func.row_number().over(
                partition_by=Artifact.concept_id,
                order_by=(Artifact.updated_at.desc(), Artifact.id.desc()),
            ).label("position"),
        ).where(Artifact.user_id == user_id).subquery()
    )
    rows = session.execute(
        select(Concept.id, Concept.name, Concept.slug, Concept.description, Concept.color,
               func.coalesce(counts.c.count, 0).label("artifact_count"),
               latest.c.title.label("recent_artifact_title"))
        .outerjoin(counts, counts.c.concept_id == Concept.id)
        .outerjoin(latest, (latest.c.concept_id == Concept.id) & (latest.c.position == 1))
        .where(Concept.user_id == user_id)
        .order_by(Concept.updated_at.desc(), Concept.id).limit(limit).offset(offset)
    )
    return [dict(row._mapping) for row in rows]


def get_concept_page(
    session: Session,
    user_id: UUID,
    slug: str,
    *,
    tag: str | None = None,
    sort: Sort = "created_asc",
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> ConceptPage | None:
    concept = session.scalars(_owned(Concept, user_id).where(Concept.slug == slug)).one_or_none()
    if concept is None:
        return None

    scoped = _owned(Artifact, user_id).where(Artifact.concept_id == concept.id)
    filtered = scoped.where(Artifact.tags.contains([tag])) if tag else scoped
    matched = session.scalar(select(func.count()).select_from(filtered.subquery())) or 0
    total = (
        matched
        if tag is None
        else (session.scalar(select(func.count()).select_from(scoped.subquery())) or 0)
    )

    source_count = (
        select(func.count()).select_from(Source)
        .where(Source.artifact_id == Artifact.id).scalar_subquery()
    )
    artifacts = session.execute(
        filtered.with_only_columns(
            Artifact.id, Artifact.title, Artifact.slug, Artifact.summary,
            Artifact.tags, Artifact.updated_at, source_count.label("source_count"),
        )
        .order_by(_SORTS[sort], Artifact.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    tag_rows = session.execute(
        select(func.unnest(Artifact.tags).label("tag"), func.count())
        .where(Artifact.user_id == user_id, Artifact.concept_id == concept.id)
        .group_by("tag")
        .order_by(desc(func.count()))
    ).all()
    return ConceptPage(
        concept=concept,
        artifacts=list(artifacts),
        tags=[row[0] for row in tag_rows[:MAX_TAGS]],
        total_tags=len(tag_rows),
        matched=matched,
        total=total,
        page_size=page_size,
    )


def get_artifact(session: Session, user_id: UUID, slug: str) -> Artifact | None:
    """One artifact with everything the reading view shows, in a single round-trip."""
    return session.scalars(
        _owned(Artifact, user_id)
        .where(Artifact.slug == slug)
        .options(selectinload(Artifact.sources), selectinload(Artifact.concept))
    ).one_or_none()


def get_relations(session: Session, user_id: UUID, artifact_id: UUID) -> dict[str, list[dict]]:
    """Outgoing and incoming edges, each resolved to the artifact on the other end."""
    return {
        "outgoing": _edges(session, user_id, Relation.from_id, Relation.to_id, artifact_id),
        "incoming": _edges(session, user_id, Relation.to_id, Relation.from_id, artifact_id),
    }


def _edges(session: Session, user_id: UUID, near, far, artifact_id: UUID) -> list[dict]:
    rows = session.execute(
        select(Relation.relation_type, Relation.note, Relation.origin,
               Artifact.title, Artifact.slug, Concept.name, Concept.color)
        .join(Artifact, Artifact.id == far)
        .join(Concept, Concept.id == Artifact.concept_id)
        .where(Relation.user_id == user_id, near == artifact_id)
        .order_by(asc(Relation.created_at))
    ).all()
    return [
        {
            "relation_type": relation_type,
            "note": note,
            "origin": origin,
            "artifact": {"title": title, "slug": slug},
            "concept": {"name": name, "color": color},
        }
        for relation_type, note, origin, title, slug, name, color in rows
    ]


def get_graph(session: Session, user_id: UUID, limit: int = 200, offset: int = 0) -> dict:
    """A bounded induced subgraph; include only edges whose endpoints are visible."""
    explanations = (
        select(Artifact.id, Artifact.title, Artifact.slug, Artifact.summary,
               Concept.name.label("concept_name"), Concept.color.label("concept_color"),
               Artifact.concept_id, Artifact.origin, literal("explanation").label("node_kind"))
        .join(Concept, Concept.id == Artifact.concept_id).where(Artifact.user_id == user_id)
    )
    concepts = select(
        Concept.id, Concept.name, Concept.slug, Concept.description, Concept.name, Concept.color,
        literal(None), literal(None), literal("concept"),
    ).where(Concept.user_id == user_id)
    combined = union_all(explanations, concepts).subquery()
    rows = session.execute(select(combined).order_by(
        combined.c.title, combined.c.id).limit(limit + 1).offset(offset)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    ids = [row.id for row in rows]
    links = session.execute(
        select(Relation.from_id, Relation.to_id, Relation.relation_type, Relation.note, Relation.origin)
        .where(Relation.user_id == user_id, Relation.from_id.in_(ids), Relation.to_id.in_(ids))
    ).all()
    connections = session.execute(
        select(ConceptConnection.from_id, ConceptConnection.to_id, ConceptConnection.kind,
               ConceptConnection.note, ConceptConnection.origin)
        .where(ConceptConnection.user_id == user_id,
               ConceptConnection.from_id.in_(ids), ConceptConnection.to_id.in_(ids))
    ).all()
    discussions = {}
    mentions = session.execute(select(ConceptMention, AgentTurn).join(AgentTurn, AgentTurn.id == ConceptMention.turn_id).where(ConceptMention.user_id == user_id, AgentTurn.user_id == user_id, ConceptMention.concept_id.in_(ids)).order_by(ConceptMention.created_at.desc()).limit(1000)).all()
    for mention, turn in mentions:
        links_for_concept = discussions.setdefault(mention.concept_id, [])
        if len(links_for_concept) < 2 and not any(d["turnId"] == str(turn.id) for d in links_for_concept):
            links_for_concept.append({"question": turn.message, "turnId": str(turn.id), "url": f"/chat/{turn.session_id}?turn={turn.id}&block={mention.block_id}"})
    return {
        "nodes": [{"id": row.id, "title": row.title, "slug": row.slug, "summary": row.summary,
                   "concept_name": row.concept_name,
                   "concept_color": row.concept_color or _FALLBACK_COLOUR,
                   "node_kind": row.node_kind, "discussions": discussions.get(row.id, [])} for row in rows],
        "links": [
            {"source": source, "target": target, "relation_type": kind, "note": note, "origin": origin}
            for source, target, kind, note, origin in [*links, *connections]
        ] + [
            {"source": row.id, "target": row.concept_id, "relation_type": "explains",
             "note": None, "origin": row.origin}
            for row in rows if row.node_kind == "explanation" and row.concept_id in ids
        ],
        "has_more": has_more,
    }
