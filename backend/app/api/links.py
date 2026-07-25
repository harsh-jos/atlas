"""Proposing connections, and undoing them — machine-made edges must always be reversible."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.deps import CurrentUser, SessionDep
from app.db.models import Artifact, Concept
from app.linker.service import LinkReport, Linker, prune_ai_relations

router = APIRouter(prefix="/links", tags=["links"])


class ProposeRequest(BaseModel):
    concept_slug: str


class PruneReport(BaseModel):
    removed: int


@router.post("/propose", response_model=LinkReport)
def propose(request: ProposeRequest, session: SessionDep, user: CurrentUser) -> LinkReport:
    """Link every artifact in a concept, against each other and against the wider base."""
    concept = session.scalars(
        select(Concept).where(Concept.user_id == user.id, Concept.slug == request.concept_slug)
    ).one_or_none()
    if concept is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "concept not found")

    artifact_ids = list(
        session.scalars(
            select(Artifact.id).where(
                Artifact.user_id == user.id, Artifact.concept_id == concept.id
            )
        )
    )
    return Linker(session, user).propose(artifact_ids)


@router.delete("/ai", response_model=PruneReport)
def prune(session: SessionDep, user: CurrentUser) -> PruneReport:
    """Drop every machine-made edge in one query, leaving hand-drawn ones untouched."""
    return PruneReport(removed=prune_ai_relations(session, user))
