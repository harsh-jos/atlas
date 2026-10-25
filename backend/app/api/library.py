"""Read endpoints for the knowledge base — everything the frontend renders."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app import library
from app.auth.deps import CurrentUserId, SessionDep
from app.core.enums import ArtifactFormat, Origin, RelationType, SourceType
from app.search import search_artifacts

router = APIRouter(tags=["library"])


class Payload(BaseModel):
    """camelCase on the wire so the TypeScript side reads naturally."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class ConceptSummary(Payload):
    id: UUID
    name: str
    slug: str
    description: str | None
    color: str | None
    artifact_count: int
    recent_artifact_title: str | None


class ArtifactSummary(Payload):
    id: UUID
    title: str
    slug: str
    summary: str | None
    tags: list[str]
    source_count: int
    updated_at: datetime


class ConceptDetail(Payload):
    id: UUID
    name: str
    slug: str
    description: str | None
    color: str | None
    overview: str | None
    artifact_count: int


class ConceptPage(Payload):
    concept: ConceptDetail
    artifacts: list[ArtifactSummary]
    tags: list[str]
    total_tags: int
    matched: int
    page: int
    page_size: int


class SourceOut(Payload):
    source_type: SourceType
    title: str
    author: str | None
    url: str | None
    ref: str | None


class RelatedArtifact(Payload):
    title: str
    slug: str


class RelatedConcept(Payload):
    name: str
    color: str | None


class RelationOut(Payload):
    relation_type: RelationType
    note: str | None
    origin: Origin
    artifact: RelatedArtifact
    concept: RelatedConcept


class ArtifactDetail(Payload):
    id: UUID
    title: str
    slug: str
    summary: str | None
    body: str | None
    body_html: str | None
    format: ArtifactFormat
    tags: list[str]
    metadata: dict | None
    origin: Origin
    created_at: datetime
    updated_at: datetime
    concept: ConceptDetail
    sources: list[SourceOut]
    relations_from: list[RelationOut]
    relations_to: list[RelationOut]


class SearchHit(Payload):
    slug: str
    title: str
    summary: str | None
    concept: str
    concept_color: str | None
    tags: list[str]
    source_count: int
    updated_at: datetime
    excerpt: str | None


class GraphNode(Payload):
    discussions: list[dict] = []
    node_kind: Literal["concept", "explanation"] = "explanation"
    id: UUID
    title: str
    slug: str
    summary: str | None
    concept_name: str
    concept_color: str


class GraphLink(Payload):
    source: UUID
    target: UUID
    relation_type: RelationType | Literal["requires", "related_to", "explains", "contrasts_with", "uses", "part_of", "enables"]
    note: str | None
    origin: Origin


class Graph(Payload):
    has_more: bool = False
    nodes: list[GraphNode]
    links: list[GraphLink]


def _concept_detail(concept, artifact_count: int) -> ConceptDetail:
    return ConceptDetail(
        id=concept.id,
        name=concept.name,
        slug=concept.slug,
        description=concept.description,
        color=concept.color,
        overview=concept.overview,
        artifact_count=artifact_count,
    )


@router.get("/concepts", response_model=list[ConceptSummary])
def list_concepts(session: SessionDep, user_id: CurrentUserId,
                  limit: int = Query(100, ge=1, le=101), offset: int = Query(0, ge=0, le=1000000)) -> list[ConceptSummary]:
    return [ConceptSummary(**row) for row in library.list_concepts(session, user_id, limit, offset)]


@router.get("/concepts/{slug}", response_model=ConceptPage)
def get_concept(
    slug: str,
    session: SessionDep,
    user_id: CurrentUserId,
    tag: str | None = None,
    sort: library.Sort = "created_asc",
    page: Annotated[int, Query(ge=1)] = 1,
) -> ConceptPage:
    found = library.get_concept_page(session, user_id, slug, tag=tag, sort=sort, page=page)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "concept not found")
    return ConceptPage(
        concept=_concept_detail(found.concept, found.total),
        artifacts=[
            ArtifactSummary(
                id=artifact.id,
                title=artifact.title,
                slug=artifact.slug,
                summary=artifact.summary,
                tags=artifact.tags,
                source_count=artifact.source_count,
                updated_at=artifact.updated_at,
            )
            for artifact in found.artifacts
        ],
        tags=found.tags,
        total_tags=found.total_tags,
        matched=found.matched,
        page=page,
        page_size=found.page_size,
    )


@router.get("/artifacts/{slug}", response_model=ArtifactDetail)
def get_artifact(slug: str, session: SessionDep, user_id: CurrentUserId) -> ArtifactDetail:
    artifact = library.get_artifact(session, user_id, slug)
    if artifact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "artifact not found")
    edges = library.get_relations(session, user_id, artifact.id)
    return ArtifactDetail(
        id=artifact.id,
        title=artifact.title,
        slug=artifact.slug,
        summary=artifact.summary,
        body=artifact.body,
        body_html=artifact.body_html,
        format=artifact.format,
        tags=artifact.tags,
        metadata=artifact.meta,
        origin=artifact.origin,
        created_at=artifact.created_at,
        updated_at=artifact.updated_at,
        concept=_concept_detail(artifact.concept, 0),
        sources=[SourceOut.model_validate(source) for source in artifact.sources],
        relations_from=[RelationOut(**edge) for edge in edges["outgoing"]],
        relations_to=[RelationOut(**edge) for edge in edges["incoming"]],
    )


@router.get("/search", response_model=list[SearchHit])
def search(
    session: SessionDep,
    user_id: CurrentUserId,
    q: Annotated[str, Query(min_length=1, max_length=200)],
) -> list[SearchHit]:
    return [SearchHit(**hit) for hit in search_artifacts(session, user_id, q)]


@router.get("/graph", response_model=Graph)
def graph(session: SessionDep, user_id: CurrentUserId,
          limit: int = Query(200, ge=1, le=500), offset: int = Query(0, ge=0, le=1000000)) -> Graph:
    return Graph(**library.get_graph(session, user_id, limit, offset))


@router.get("/concepts/{slug}/neighbourhood")
def concept_neighbourhood(slug: str, session: SessionDep, user_id: CurrentUserId) -> dict:
    from app.agent.knowledge import neighbourhood

    try:
        return neighbourhood(session, user_id, slug)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "concept not found") from None


@router.get("/concepts/{slug}/discussions")
def concept_discussions(slug: str, session: SessionDep, user_id: CurrentUserId):
    from app.agent.provenance import discussions
    return discussions(session, user_id, slug)


@router.get("/artifacts/{slug}/revisions")
def artifact_revisions(slug: str, session: SessionDep, user_id: CurrentUserId):
    from sqlalchemy import select
    from app.db.models import ArtifactRevision
    artifact = library.get_artifact(session, user_id, slug)
    if not artifact:
        raise HTTPException(404, "artifact not found")
    return [{"id": str(r.id), "createdAt": r.created_at.isoformat(), "snapshot": r.snapshot} for r in session.scalars(select(ArtifactRevision).where(ArtifactRevision.user_id == user_id, ArtifactRevision.artifact_id == artifact.id).order_by(ArtifactRevision.created_at.desc()).limit(30))]


@router.get("/artifacts/{slug}/export")
def export_artifact(slug: str, session: SessionDep, user_id: CurrentUserId):
    from app.agent.artifacts import export_content
    artifact = library.get_artifact(session, user_id, slug)
    if not artifact:
        raise HTTPException(404, "artifact not found")
    return export_content(artifact)
