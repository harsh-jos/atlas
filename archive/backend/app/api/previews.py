"""Curation: what a source would become, and the choice of what to keep."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.library import Payload, SearchHit
from app.auth.deps import CurrentUser, SessionDep
from app.pipeline.preview import PreviewService, UnknownConcept, UnknownPreview
from app.pipeline.writer import ImportSummary
from app.search import search_artifacts

router = APIRouter(prefix="/previews", tags=["previews"])


class ProposedArtifact(BaseModel):
    sourceKey: str
    title: str
    breadcrumb: str | None
    bytes: int


class PreviewSummary(Payload):
    id: UUID
    concept_name: str
    artifact_count: int
    total_bytes: int


class PreviewDetail(Payload):
    id: UUID
    concept_name: str
    existing_concept_id: UUID | None  # what the proposed name would extend, if it already exists
    artifacts: list[ProposedArtifact]
    total_bytes: int
    already_known: list[SearchHit]


class Selection(BaseModel):
    """What to keep, and where: an existing concept by id, a new name, or the proposal's own."""

    source_keys: list[str]
    concept_id: UUID | None = None
    concept_name: str | None = None


def _service(session: SessionDep, user: CurrentUser) -> PreviewService:
    return PreviewService(session, user)


def _found(session, user, preview_id: UUID) -> PreviewService:
    """A preview that is missing, expired, or another user's is indistinguishable."""
    service = _service(session, user)
    try:
        service.outline(preview_id)
    except UnknownPreview:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preview not found") from None
    return service


@router.get("", response_model=list[PreviewSummary])
def list_previews(session: SessionDep, user: CurrentUser) -> list[PreviewSummary]:
    service = _service(session, user)
    return [
        PreviewSummary(
            id=preview.id,
            concept_name=preview.concept_name,
            artifact_count=len(outline),
            total_bytes=sum(item["bytes"] for item in outline),
        )
        for preview in service.pending()
        for outline in [service.outline(preview.id)]
    ]


@router.get("/{preview_id}", response_model=PreviewDetail)
def get_preview(preview_id: UUID, session: SessionDep, user: CurrentUser) -> PreviewDetail:
    service = _found(session, user, preview_id)
    preview = service.previews.get(preview_id)
    outline = service.outline(preview_id)
    existing = service.existing_concept(preview_id)
    assert preview is not None
    return PreviewDetail(
        id=preview.id,
        concept_name=preview.concept_name,
        existing_concept_id=existing.id if existing else None,
        artifacts=[ProposedArtifact(**item) for item in outline],
        total_bytes=sum(item["bytes"] for item in outline),
        already_known=[
            SearchHit(**hit) for hit in search_artifacts(session, user.id, preview.concept_name)
        ],
    )


@router.post("/{preview_id}/commit", response_model=ImportSummary)
def commit_preview(
    preview_id: UUID, selection: Selection, session: SessionDep, user: CurrentUser
) -> ImportSummary:
    """Writes only the chosen artifacts; an empty selection is refused, not read as 'all'."""
    if not selection.source_keys:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "choose at least one artifact")
    if selection.concept_name is not None and not selection.concept_name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "give the concept a name")
    try:
        return _found(session, user, preview_id).commit(
            preview_id,
            selection.source_keys,
            concept_id=selection.concept_id,
            concept_name=selection.concept_name.strip() if selection.concept_name else None,
        )
    except UnknownConcept:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "concept not found") from None


@router.delete("/{preview_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_preview(preview_id: UUID, session: SessionDep, user: CurrentUser) -> None:
    _found(session, user, preview_id).discard(preview_id)
