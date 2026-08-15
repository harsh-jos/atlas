"""Preview: park a built import so the user chooses what enters the knowledge base."""

from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import TypedDict
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Concept, Preview, User
from app.db.repository import OwnedRepository
from app.pipeline.models import ConceptSpec, MappedImport
from app.pipeline.serialization import dump_import, load_import
from app.pipeline.writer import (
    ImportSummary,
    ImportWriter,
    ensure_concept,
    find_concept,
    text_bytes,
)
from app.storage.quota import QuotaService


class UnknownPreview(LookupError):
    """Raised when a preview id is missing, expired, or belongs to another user."""


class UnknownConcept(LookupError):
    """Raised when a commit targets a concept that is missing or belongs to another user."""


def _cutoff() -> datetime:
    return datetime.now(UTC) - timedelta(minutes=get_settings().preview_ttl_minutes)


def sweep_expired_previews(session: Session) -> int:
    """Drop previews nobody committed — an abandoned crawl's payload is not small."""
    return session.execute(delete(Preview).where(Preview.created_at < _cutoff())).rowcount


class PreviewRepository(OwnedRepository[Preview]):
    model = Preview


class ConceptRepository(OwnedRepository[Concept]):
    model = Concept


class OutlineItem(TypedDict):
    sourceKey: str
    title: str
    breadcrumb: str | None
    bytes: int


def select_artifacts(mapped: MappedImport, source_keys: Sequence[str] | None) -> MappedImport:
    """Keep the chosen artifacts and only the edges whose both ends survived the cut."""
    if source_keys is None:
        return mapped
    kept = {key for key in source_keys}
    artifacts = [a for a in mapped.artifacts if a.source_key in kept]
    surviving = {a.source_key for a in artifacts}
    return MappedImport(
        concept=mapped.concept,
        artifacts=artifacts,
        relations=[
            r for r in mapped.relations if r.from_key in surviving and r.to_key in surviving
        ],
    )


class PreviewService:
    """Builds nothing itself — it parks a MappedImport, describes it, and commits a selection."""

    def __init__(self, session: Session, user: User) -> None:
        self.session = session
        self.user = user
        self.previews = PreviewRepository(session, user.id)
        self.concepts = ConceptRepository(session, user.id)

    def park(self, mapped: MappedImport, scope: str) -> Preview:
        return self.previews.add(
            Preview(concept_name=mapped.concept.name, scope=scope, payload=dump_import(mapped))
        )

    def pending(self) -> list[Preview]:
        """Previews still awaiting a decision, newest first."""
        fresh = [p for p in self.previews.list() if p.created_at >= _cutoff()]
        return sorted(fresh, key=lambda preview: preview.created_at, reverse=True)

    def discard(self, preview_id: UUID) -> None:
        self.previews.delete(self._preview(preview_id))

    def outline(self, preview_id: UUID) -> list[OutlineItem]:
        return [
            {
                "sourceKey": artifact.source_key,
                "title": artifact.title,
                "breadcrumb": artifact.metadata.get("breadcrumb"),
                "bytes": text_bytes(artifact.body, artifact.summary),
            }
            for artifact in self._mapped(preview_id).artifacts
        ]

    def existing_concept(self, preview_id: UUID) -> Concept | None:
        """The concept the proposal would extend if committed under its proposed name."""
        return find_concept(self.session, self.user.id, self._preview(preview_id).concept_name)

    def commit(
        self,
        preview_id: UUID,
        source_keys: Sequence[str] | None = None,
        *,
        concept_id: UUID | None = None,
        concept_name: str | None = None,
    ) -> ImportSummary:
        """Writes the selection; unselected sections stay unwritten but are not treated as gone.

        Where it lands is the user's call: `concept_id` extends a concept they already have,
        `concept_name` renames the proposed one (creating it, or extending a same-named concept),
        and neither means the proposal's own name.
        """
        preview = self._preview(preview_id)
        mapped = load_import(preview.payload)
        concept = self._destination(mapped.concept, concept_id, concept_name)
        summary = ImportWriter(
            self.session, self.user, QuotaService(self.session, self.user)
        ).write(
            select_artifacts(mapped, source_keys),
            known_keys=[artifact.source_key for artifact in mapped.artifacts],
            concept=concept,
        )
        self.previews.delete(preview)
        return summary

    def _destination(
        self, proposed: ConceptSpec, concept_id: UUID | None, concept_name: str | None
    ) -> Concept:
        if concept_id is not None:
            concept = self.concepts.get(concept_id)
            if concept is None:
                raise UnknownConcept(str(concept_id))
            return concept
        spec = replace(proposed, name=concept_name) if concept_name else proposed
        return ensure_concept(self.session, self.user.id, spec)

    def _preview(self, preview_id: UUID) -> Preview:
        preview = self.previews.get(preview_id)
        if preview is None or preview.created_at < _cutoff():
            raise UnknownPreview(str(preview_id))
        return preview

    def _mapped(self, preview_id: UUID) -> MappedImport:
        return load_import(self._preview(preview_id).payload)
