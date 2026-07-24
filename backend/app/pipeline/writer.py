"""[6] Writer: persist a MappedImport for one user, idempotently on (concept, sourceKey).

Atomicity belongs to the caller's transaction — a failure here leaves nothing half-written.
"""

from collections.abc import Sequence
from typing import TypedDict
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.slugify import slugify
from app.db.models import Artifact, Concept, Relation, Source
from app.pipeline.models import ArtifactSpec, MappedImport, RelationSpec

_UNTITLED = "untitled"


class ImportSummary(TypedDict):
    conceptSlug: str
    artifacts: int
    relations: int
    pruned: int


def allocate_slug(title: str, taken: set[str]) -> str:
    """Suffix until unique; mutates `taken` so a batch stays unique within itself."""
    base = slugify(title) or _UNTITLED
    slug, suffix = base, 1
    while slug in taken:
        slug = f"{base}-{suffix}"
        suffix += 1
    taken.add(slug)
    return slug


class ImportWriter:
    """Writes one import into one user's knowledge base; re-imports update rows in place."""

    def __init__(self, session: Session, user_id: UUID) -> None:
        self.session = session
        self.user_id = user_id

    def write(self, mapped: MappedImport) -> ImportSummary:
        concept = self._ensure_concept(mapped)
        artifacts = self._upsert_artifacts(concept, mapped.artifacts)
        self._replace_sources(mapped.artifacts, artifacts)
        relations = self._insert_relations(mapped.relations, artifacts)
        return {
            "conceptSlug": concept.slug,
            "artifacts": len(mapped.artifacts),
            "relations": relations,
            "pruned": self._prune_stale(concept, mapped.artifacts),
        }

    def _ensure_concept(self, mapped: MappedImport) -> Concept:
        spec = mapped.concept
        slug = slugify(spec.name) or _UNTITLED
        concept = self.session.scalars(
            select(Concept).where(Concept.user_id == self.user_id, Concept.slug == slug)
        ).one_or_none()
        if concept is None:
            concept = Concept(user_id=self.user_id, slug=slug)
            self.session.add(concept)
        concept.name = spec.name
        concept.description = spec.description or concept.description
        concept.color = spec.color or concept.color
        self.session.flush()
        return concept

    def _upsert_artifacts(
        self, concept: Concept, specs: Sequence[ArtifactSpec]
    ) -> dict[str, Artifact]:
        existing = {
            artifact.meta["sourceKey"]: artifact
            for artifact in self.session.scalars(
                select(Artifact).where(
                    Artifact.user_id == self.user_id,
                    Artifact.concept_id == concept.id,
                    Artifact.meta["sourceKey"].astext.in_([s.source_key for s in specs]),
                )
            )
        }
        taken = self._taken_slugs()
        written: dict[str, Artifact] = {}
        for spec in specs:
            artifact = existing.get(spec.source_key)
            if artifact is None:
                artifact = Artifact(
                    user_id=self.user_id,
                    concept_id=concept.id,
                    slug=allocate_slug(spec.title, taken),
                )
                self.session.add(artifact)
            artifact.title = spec.title
            artifact.summary = spec.summary
            artifact.body = spec.body
            artifact.tags = spec.tags
            artifact.meta = spec.metadata
            written[spec.source_key] = artifact
        self.session.flush()
        return written

    def _taken_slugs(self) -> set[str]:
        return set(
            self.session.scalars(select(Artifact.slug).where(Artifact.user_id == self.user_id))
        )

    def _replace_sources(
        self, specs: Sequence[ArtifactSpec], artifacts: dict[str, Artifact]
    ) -> None:
        if artifacts:
            self.session.execute(
                delete(Source)
                .where(Source.artifact_id.in_([a.id for a in artifacts.values()]))
                .execution_options(synchronize_session="fetch")
            )
        self.session.add_all(
            [
                Source(
                    artifact_id=artifacts[spec.source_key].id,
                    source_type=spec.source["sourceType"],
                    title=spec.source["title"],
                    author=spec.source.get("author"),
                    url=spec.source.get("url"),
                    ref=spec.source.get("ref"),
                )
                for spec in specs
                if spec.source
            ]
        )

    def _insert_relations(
        self, relations: Sequence[RelationSpec], artifacts: dict[str, Artifact]
    ) -> int:
        rows = []
        for relation in relations:
            source = artifacts.get(relation.from_key)
            target = artifacts.get(relation.to_key)
            if source is None or target is None or source.id == target.id:
                continue
            rows.append(
                {
                    "id": uuid4(),
                    "user_id": self.user_id,
                    "from_id": source.id,
                    "to_id": target.id,
                    "relation_type": relation.relation_type,
                    "note": relation.note,
                }
            )
        if not rows:
            return 0
        self.session.execute(
            insert(Relation)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["from_id", "to_id", "relation_type"])
        )
        return len(rows)

    def _prune_stale(self, concept: Concept, specs: Sequence[ArtifactSpec]) -> int:
        """Drop artifacts from a prior import of this scope whose section vanished this run."""
        scope = specs[0].metadata.get("scope") if specs else None
        if not scope:
            return 0
        result = self.session.execute(
            delete(Artifact)
            .where(
                Artifact.user_id == self.user_id,
                Artifact.concept_id == concept.id,
                Artifact.meta["scope"].astext == scope,
                Artifact.meta["sourceKey"].astext.notin_([s.source_key for s in specs]),
            )
            .execution_options(synchronize_session="fetch")
        )
        return result.rowcount
