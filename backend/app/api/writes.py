"""Write endpoints: every mutation the editor needs, each scoped to the caller."""

from datetime import datetime
from typing import Annotated, Any, TypeVar
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import ColumnElement, asc, delete, func, select
from sqlalchemy.orm import Session

from app.api.library import (
    ArtifactDetail,
    ConceptDetail,
    Payload,
    RelatedArtifact,
    RelatedConcept,
    RelationOut,
    _concept_detail,
)
from app.api.library import get_artifact as artifact_detail
from app.auth.deps import CurrentUser, CurrentUserId, SessionDep
from app.agent.knowledge import lock_owner
from app.core.enums import RelationType, SourceType
from app.db.models import Artifact, Concept, Relation, Source, User
from app.db.repository import OwnedRepository
from app.storage.quota import text_bytes
from app.storage.quota import QuotaExceeded, QuotaService

router = APIRouter(tags=["writes"])

RecordT = TypeVar("RecordT")


class ArtifactRepository(OwnedRepository[Artifact]):
    model = Artifact

    def by_slug(self, slug: str) -> Artifact | None:
        return self.session.scalars(self._select().where(Artifact.slug == slug)).one_or_none()


class ConceptRepository(OwnedRepository[Concept]):
    model = Concept

    def by_slug(self, slug: str) -> Concept | None:
        return self.session.scalars(self._select().where(Concept.slug == slug)).one_or_none()


class ArtifactPatch(Payload):
    expected_updated_at: datetime | None = None
    title: str | None = None
    summary: str | None = None
    body: str | None = None
    body_html: str | None = None
    tags: list[str] | None = None
    concept_id: UUID | None = None


class ConceptPatch(Payload):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    overview: str | None = None


class SourceIn(Payload):
    source_type: SourceType
    title: str
    author: str | None = None
    url: str | None = None
    ref: str | None = None


class RelationRef(Payload):
    to_slug: str
    relation_type: RelationType


class RelationIn(RelationRef):
    note: str | None = None


class ArtifactOption(Payload):
    id: UUID
    title: str
    slug: str
    concept_name: str
    concept_color: str | None


def _found(record: RecordT | None, what: str) -> RecordT:
    """Another user's row is reported as missing, so ids cannot be probed."""
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")
    return record


def _apply(record: object, fields: dict[str, Any]) -> None:
    for name, value in fields.items():
        setattr(record, name, value)


def _cost(body: str | None, summary: str | None) -> int:
    """What an artifact costs — the import writer's definition, so both agree."""
    return text_bytes(body, summary)


def _charge(session: Session, user: User, delta: int) -> None:
    """Settle the byte delta before writing, so an over-quota edit changes nothing."""
    quota = QuotaService(session, user)
    try:
        if delta > 0:
            quota.reserve(delta)
        elif delta < 0:
            quota.release(-delta)
    except QuotaExceeded as error:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, str(error)) from None


def _artifact_count(session: Session, concept: Concept) -> int:
    return (
        session.scalar(
            select(func.count()).select_from(Artifact).where(Artifact.concept_id == concept.id)
        )
        or 0
    )


def _edge(
    user_id: UUID, source: Artifact, target: Artifact, kind: RelationType
) -> tuple[ColumnElement[bool], ...]:
    return (
        Relation.user_id == user_id,
        Relation.from_id == source.id,
        Relation.to_id == target.id,
        Relation.relation_type == kind,
    )


@router.patch("/artifacts/{slug}", response_model=ArtifactDetail)
def update_artifact(
    slug: str, patch: ArtifactPatch, session: SessionDep, user: CurrentUser
) -> ArtifactDetail:
    """Edits an artifact in place; a rename never re-slugs, so links cannot rot."""
    user = lock_owner(session, user.id)
    artifact = _found(ArtifactRepository(session, user.id).by_slug(slug), "artifact")
    if patch.expected_updated_at is not None and artifact.updated_at != patch.expected_updated_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "This explanation changed. Reload before saving.")
    fields = patch.model_dump(exclude_unset=True, exclude={"expected_updated_at"})
    if "concept_id" in fields:
        _found(ConceptRepository(session, user.id).get(fields["concept_id"]), "concept")
    after = _cost(fields.get("body", artifact.body), fields.get("summary", artifact.summary))
    _charge(session, user, after - _cost(artifact.body, artifact.summary))
    _apply(artifact, fields)
    session.flush()
    return artifact_detail(slug, session, user.id)


@router.delete("/artifacts/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artifact(slug: str, session: SessionDep, user: CurrentUser) -> None:
    user = lock_owner(session, user.id)
    artifacts = ArtifactRepository(session, user.id)
    artifact = _found(artifacts.by_slug(slug), "artifact")
    _charge(session, user, -_cost(artifact.body, artifact.summary))
    artifacts.delete(artifact)


@router.patch("/concepts/{slug}", response_model=ConceptDetail)
def update_concept(
    slug: str, patch: ConceptPatch, session: SessionDep, user_id: CurrentUserId
) -> ConceptDetail:
    lock_owner(session, user_id)
    concept = _found(ConceptRepository(session, user_id).by_slug(slug), "concept")
    _apply(concept, patch.model_dump(exclude_unset=True))
    session.flush()
    return _concept_detail(concept, _artifact_count(session, concept))


@router.delete("/concepts/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_concept(slug: str, session: SessionDep, user: CurrentUser) -> None:
    """The foreign key cascades to the artifacts, so their bytes go back first."""
    user = lock_owner(session, user.id)
    concepts = ConceptRepository(session, user.id)
    concept = _found(concepts.by_slug(slug), "concept")
    size = session.scalar(
        select(func.coalesce(func.sum(
            func.octet_length(func.coalesce(Artifact.body, ""))
            + func.octet_length(func.coalesce(Artifact.summary, ""))
        ), 0)).where(Artifact.user_id == user.id, Artifact.concept_id == concept.id)
    )
    _charge(session, user, -size)
    session.execute(delete(Concept).where(Concept.id == concept.id, Concept.user_id == user.id))


@router.put("/artifacts/{slug}/sources", response_model=ArtifactDetail)
def replace_sources(
    slug: str, sources: list[SourceIn], session: SessionDep, user_id: CurrentUserId
) -> ArtifactDetail:
    """Replaces the whole provenance set, the way the import writer does."""
    lock_owner(session, user_id)
    artifact = _found(ArtifactRepository(session, user_id).by_slug(slug), "artifact")
    artifact.sources = [Source(**source.model_dump()) for source in sources]
    session.flush()
    return artifact_detail(slug, session, user_id)


@router.post(
    "/artifacts/{slug}/relations", response_model=RelationOut, status_code=status.HTTP_201_CREATED
)
def create_relation(
    slug: str, payload: RelationIn, session: SessionDep, user_id: CurrentUserId
) -> RelationOut:
    """Links two of the caller's own artifacts; repeating an existing edge is a no-op."""
    lock_owner(session, user_id)
    artifacts = ArtifactRepository(session, user_id)
    source = _found(artifacts.by_slug(slug), "artifact")
    target = _found(artifacts.by_slug(payload.to_slug), "artifact")
    if source.id == target.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "an artifact cannot relate to itself")

    where = _edge(user_id, source, target, payload.relation_type)
    relation = session.scalars(select(Relation).where(*where)).one_or_none()
    if relation is None:
        relation = Relation(
            user_id=user_id,
            from_id=source.id,
            to_id=target.id,
            relation_type=payload.relation_type,
            note=payload.note,
        )
        session.add(relation)
        session.flush()
    return RelationOut(
        relation_type=relation.relation_type,
        note=relation.note,
        origin=relation.origin,
        artifact=RelatedArtifact(title=target.title, slug=target.slug),
        concept=RelatedConcept(name=target.concept.name, color=target.concept.color),
    )


@router.delete("/artifacts/{slug}/relations", status_code=status.HTTP_204_NO_CONTENT)
def delete_relation(
    slug: str, payload: RelationRef, session: SessionDep, user_id: CurrentUserId
) -> None:
    lock_owner(session, user_id)
    artifacts = ArtifactRepository(session, user_id)
    source = _found(artifacts.by_slug(slug), "artifact")
    target = _found(artifacts.by_slug(payload.to_slug), "artifact")
    session.execute(delete(Relation).where(*_edge(user_id, source, target, payload.relation_type)))


@router.get("/artifacts", response_model=list[ArtifactOption])
def list_artifacts(
    session: SessionDep,
    user_id: CurrentUserId,
    q: Annotated[str, Query(max_length=200)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ArtifactOption]:
    """Candidates for the relation picker."""
    statement = (
        select(Artifact.id, Artifact.title, Artifact.slug, Concept.name, Concept.color)
        .join(Concept, Concept.id == Artifact.concept_id)
        .where(Artifact.user_id == user_id)
        .order_by(asc(Artifact.title))
        .limit(limit)
    )
    if q:
        statement = statement.where(Artifact.title.ilike(f"%{q}%"))
    return [
        ArtifactOption(id=row_id, title=title, slug=slug, concept_name=name, concept_color=color)
        for row_id, title, slug, name, color in session.execute(statement)
    ]


@router.delete("/concept-connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_concept_connection(
    connection_id: UUID, session: SessionDep, user_id: CurrentUserId
) -> None:
    from app.db.models import ConceptConnection

    lock_owner(session, user_id)
    row = session.scalar(
        select(ConceptConnection).where(
            ConceptConnection.id == connection_id, ConceptConnection.user_id == user_id
        )
    )
    _found(row, "connection")
    session.delete(row)
