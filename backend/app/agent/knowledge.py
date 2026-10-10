"""Owned, transactional operations shared by agent tools and graph inspection."""

import hashlib
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, load_only

from app.core.enums import ArtifactFormat, Origin, SourceType
from app.core.slugify import slugify
from app.db.models import Artifact, Concept, ConceptConnection, Source, User
from app.storage.quota import QuotaService, text_bytes


def bounded(value: str, label: str, maximum: int) -> str:
    value = value.strip()
    if not value or len(value) > maximum:
        raise ValueError(f"{label} must contain 1–{maximum} characters.")
    return value


def lock_owner(session: Session, user_id: UUID) -> User:
    return session.scalars(select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)).one()


def owned(session: Session, model, user_id: UUID, slug: str):
    row = session.scalar(select(model).where(model.user_id == user_id, model.slug == slug))
    if row is None:
        raise ValueError("Saved item not found.")
    return row


def concept_data(row: Concept) -> dict:
    return {
        "slug": row.slug,
        "name": row.name,
        "description": row.description,
        "url": f"/collections/{row.slug}",
    }


def remember_concept(session: Session, user_id: UUID, name: str, description: str) -> dict:
    name = bounded(name, "Concept name", 200)
    description = bounded(description, "Description", 2000)
    # Stable across retries, including names written in non-Latin scripts.
    slug = slugify(name) or hashlib.sha256(name.casefold().encode()).hexdigest()[:20]
    lock_owner(session, user_id)
    row = session.scalar(select(Concept).where(Concept.user_id == user_id, Concept.slug == slug))
    created = row is None
    if created:
        row = Concept(user_id=user_id, name=name, slug=slug, description=description)
        session.add(row)
        session.flush()
    return {**concept_data(row), "created": created}


def connect_concepts(
    session: Session, user_id: UUID, from_slug: str, to_slug: str, kind: str, note: str
) -> dict:
    if kind not in {"requires", "related_to"}:
        raise ValueError("Connection kind must be requires or related_to.")
    note = bounded(note, "Connection reason", 1000)
    lock_owner(session, user_id)
    source = owned(session, Concept, user_id, from_slug)
    target = owned(session, Concept, user_id, to_slug)
    if source.id == target.id:
        raise ValueError("A concept cannot connect to itself.")
    if kind == "related_to" and str(source.id) > str(target.id):
        source, target = target, source
    row = session.scalar(
        select(ConceptConnection).where(
            ConceptConnection.user_id == user_id,
            ConceptConnection.from_id == source.id,
            ConceptConnection.to_id == target.id,
            ConceptConnection.kind == kind,
        )
    )
    created = row is None
    if created:
        row = ConceptConnection(
            user_id=user_id, from_id=source.id, to_id=target.id, kind=kind, note=note
        )
        session.add(row)
        session.flush()
    return {
        "id": str(row.id),
        "from_slug": source.slug,
        "to_slug": target.slug,
        "kind": kind,
        "note": row.note,
        "created": created,
    }


def neighbourhood(session: Session, user_id: UUID, slug: str = "") -> dict:
    """At most 20 neighbours and 10 explanations; never load a whole graph into context."""
    if not slug:
        rows = session.scalars(
            select(Concept)
            .where(Concept.user_id == user_id)
            .order_by(Concept.updated_at.desc(), Concept.id)
            .limit(21)
        ).all()
        return {"concepts": [concept_data(row) for row in rows[:20]], "has_more": len(rows) > 20}
    focus = owned(session, Concept, user_id, slug)
    edges = session.scalars(
        select(ConceptConnection)
        .where(
            ConceptConnection.user_id == user_id,
            or_(ConceptConnection.from_id == focus.id, ConceptConnection.to_id == focus.id),
        )
        .order_by(ConceptConnection.created_at, ConceptConnection.id)
        .limit(21)
    ).all()
    other_ids = {edge.to_id if edge.from_id == focus.id else edge.from_id for edge in edges[:20]}
    others = {
        row.id: row for row in session.scalars(
            select(Concept).where(Concept.user_id == user_id, Concept.id.in_(other_ids))
            .options(load_only(Concept.id, Concept.name, Concept.slug, Concept.description))
        )
    } if other_ids else {}
    neighbours = []
    for edge in edges[:20]:
        other_id = edge.to_id if edge.from_id == focus.id else edge.from_id
        other = others.get(other_id)
        if other:
            neighbours.append(
                {
                    **concept_data(other),
                    "connection_id": str(edge.id),
                    "kind": edge.kind,
                    "direction": "outgoing" if edge.from_id == focus.id else "incoming",
                    "note": edge.note,
                }
            )
    artifacts = session.scalars(
        select(Artifact)
        .options(load_only(Artifact.slug, Artifact.title, Artifact.summary))
        .where(Artifact.user_id == user_id, Artifact.concept_id == focus.id)
        .order_by(Artifact.updated_at.desc(), Artifact.id)
        .limit(11)
    ).all()
    return {
        "concept": concept_data(focus),
        "connections": neighbours,
        "explanations": [
            {
                "slug": a.slug,
                "title": a.title,
                "summary": a.summary,
                "kind": "explains",
                "url": f"/entries/{a.slug}",
            }
            for a in artifacts[:10]
        ],
        "has_more_connections": len(edges) > 20,
        "has_more_explanations": len(artifacts) > 10,
    }


def read_explanation(session: Session, user_id: UUID, slug: str) -> dict:
    row = owned(session, Artifact, user_id, slug)
    return {
        "slug": row.slug,
        "title": row.title,
        "summary": row.summary,
        "body": (row.body or "")[:60000],
        "truncated": len(row.body or "") > 60000,
        "updated_at": row.updated_at.isoformat(),
        "url": f"/entries/{row.slug}",
        "sources": [{"title": s.title, "url": s.url} for s in row.sources],
    }


def save_explanation(
    session: Session,
    user_id: UUID,
    concept_slug: str,
    title: str,
    summary: str,
    body: str,
    source_urls: list[str],
) -> dict:
    title = bounded(title, "Title", 500)
    summary = bounded(summary, "Summary", 2000)
    body = bounded(body, "Explanation", 60000)
    if len(source_urls) > 10 or any(
        len(url) > 4000 or urlparse(url).scheme not in {"http", "https"} or not urlparse(url).netloc
        for url in source_urls
    ):
        raise ValueError("Supply at most 10 valid HTTP source URLs.")
    user = lock_owner(session, user_id)
    concept = owned(session, Concept, user_id, concept_slug)
    key = hashlib.sha256(f"{concept.id}:{title.casefold()}".encode()).hexdigest()[:12]
    slug = f"{slugify(title)[:460] or 'explanation'}-{key}"
    row = session.scalar(select(Artifact).where(Artifact.user_id == user_id, Artifact.slug == slug))
    if row:
        return {
            "slug": row.slug,
            "url": f"/entries/{row.slug}",
            "created": False,
            "message": "Already saved. Read it before requesting a revision.",
        }
    QuotaService(session, user).reserve(text_bytes(body, summary))
    row = Artifact(
        user_id=user_id,
        concept_id=concept.id,
        slug=slug,
        title=title,
        summary=summary,
        body=body,
        origin=Origin.AI,
        tags=[],
    )
    row.sources = [
        Source(source_type=SourceType.WEBSITE, title=urlparse(url).netloc, url=url)
        for url in dict.fromkeys(source_urls)
    ]
    session.add(row)
    session.flush()
    return {"slug": slug, "url": f"/entries/{slug}", "created": True}


def revise_explanation(
    session: Session, user_id: UUID, slug: str, expected_updated_at: str, body: str, summary: str
) -> dict:
    body = bounded(body, "Explanation", 60000)
    summary = bounded(summary, "Summary", 2000)
    user = lock_owner(session, user_id)
    row = session.scalars(
        select(Artifact).where(Artifact.user_id == user_id, Artifact.slug == slug).with_for_update()
    ).one_or_none()
    if row is None:
        raise ValueError("Saved item not found.")
    if row.format != ArtifactFormat.MD:
        raise ValueError("Only Markdown explanations can be revised with this tool.")
    if row.updated_at.isoformat() != expected_updated_at:
        raise ValueError("The explanation changed. Read it again before revising.")
    quota = QuotaService(session, user)
    delta = text_bytes(body, summary) - text_bytes(row.body, row.summary)
    if delta > 0:
        quota.reserve(delta)
    elif delta < 0:
        quota.release(-delta)
    row.body, row.summary, row.body_html = body, summary, None
    session.flush()
    return {"slug": slug, "url": f"/entries/{slug}", "updated_at": row.updated_at.isoformat()}
