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
from app.db.models import Artifact, Concept, Relation, Source, User
from app.pipeline.models import ArtifactSpec, MappedImport, RelationSpec
from app.storage.quota import QuotaService

_UNTITLED = "untitled"


class ImportSummary(TypedDict):
    conceptSlug: str
    artifacts: int
    relations: int
    pruned: int
    bytes: int


def allocate_slug(title: str, taken: set[str]) -> str:
    """Suffix until unique; mutates `taken` so a batch stays unique within itself."""
    base = slugify(title) or _UNTITLED
    slug, suffix = base, 1
    while slug in taken:
        slug = f"{base}-{suffix}"
        suffix += 1
    taken.add(slug)
    return slug


def text_bytes(*parts: str | None) -> int:
    """What an artifact costs against the quota: its stored text, UTF-8 encoded."""
    return sum(len(part.encode()) for part in parts if part)


class ImportWriter:
    """Writes one import into one user's knowledge base; re-imports update rows in place."""

    def __init__(self, session: Session, user: User, quota: QuotaService) -> None:
        self.session = session
        self.user_id: UUID = user.id
        self.quota = quota

    def write(
        self, mapped: MappedImport, known_keys: Sequence[str] | None = None
    ) -> ImportSummary:
        """`known_keys` is everything the source offered; without it, the selection is the source.

        Pruning compares against the source, not against the selection — otherwise committing a
        curated subset would delete artifacts the user kept from an earlier import.
        """
        concept = self._ensure_concept(mapped)
        existing = self._existing_artifacts(concept, mapped.artifacts)
        stale = self._stale_artifacts(concept, mapped.artifacts, known_keys)
        delta = self._charge(mapped.artifacts, [*existing.values(), *stale])

        artifacts = self._upsert_artifacts(concept, mapped.artifacts, existing)
        self._replace_sources(mapped.artifacts, artifacts)
        relations = self._insert_relations(mapped.relations, artifacts)
        self._prune(stale)
        return {
            "conceptSlug": concept.slug,
            "artifacts": len(mapped.artifacts),
            "relations": relations,
            "pruned": len(stale),
            "bytes": delta,
        }

    def _charge(self, specs: Sequence[ArtifactSpec], replaced: Sequence[Artifact]) -> int:
        """Reserve before writing, so an over-quota import fails without half-filling the base."""
        incoming = sum(text_bytes(s.body, s.summary) for s in specs)
        delta = incoming - sum(text_bytes(a.body, a.summary) for a in replaced)
        if delta > 0:
            self.quota.reserve(delta)
        elif delta < 0:
            self.quota.release(-delta)
        return delta

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

    def _existing_artifacts(
        self, concept: Concept, specs: Sequence[ArtifactSpec]
    ) -> dict[str, Artifact]:
        rows = self.session.scalars(
            self._in_concept(concept).where(
                Artifact.meta["sourceKey"].astext.in_([s.source_key for s in specs])
            )
        )
        return {artifact.meta["sourceKey"]: artifact for artifact in rows}

    def _stale_artifacts(
        self, concept: Concept, specs: Sequence[ArtifactSpec], known_keys: Sequence[str] | None
    ) -> Sequence[Artifact]:
        """Artifacts from a prior import of this scope whose section vanished from the source."""
        scope = specs[0].metadata.get("scope") if specs else None
        if not scope:
            return []
        keep = list(known_keys) if known_keys is not None else [s.source_key for s in specs]
        return list(
            self.session.scalars(
                self._in_concept(concept).where(
                    Artifact.meta["scope"].astext == scope,
                    Artifact.meta["sourceKey"].astext.notin_(keep),
                )
            )
        )

    def _in_concept(self, concept: Concept):
        return select(Artifact).where(
            Artifact.user_id == self.user_id, Artifact.concept_id == concept.id
        )

    def _upsert_artifacts(
        self, concept: Concept, specs: Sequence[ArtifactSpec], existing: dict[str, Artifact]
    ) -> dict[str, Artifact]:
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

    def _prune(self, stale: Sequence[Artifact]) -> None:
        if not stale:
            return
        self.session.execute(
            delete(Artifact)
            .where(Artifact.id.in_([a.id for a in stale]))
            .execution_options(synchronize_session="fetch")
        )
