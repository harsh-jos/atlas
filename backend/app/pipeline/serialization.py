"""Round-trip a MappedImport through JSON so it can be parked between preview and commit."""

from dataclasses import asdict
from typing import Any

from app.core.enums import RelationType
from app.pipeline.models import ArtifactSpec, ConceptSpec, MappedImport, RelationSpec


def dump_import(mapped: MappedImport) -> dict[str, Any]:
    return asdict(mapped)


def load_import(payload: dict[str, Any]) -> MappedImport:
    return MappedImport(
        concept=ConceptSpec(**payload["concept"]),
        artifacts=[ArtifactSpec(**artifact) for artifact in payload["artifacts"]],
        relations=[
            RelationSpec(**{**relation, "relation_type": RelationType(relation["relation_type"])})
            for relation in payload["relations"]
        ],
    )
