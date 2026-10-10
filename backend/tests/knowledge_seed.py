"""Small persisted knowledge sample for read and edit API tests."""

from app.core.enums import RelationType, SourceType
from app.core.slugify import slugify
from app.db.models import Artifact, Concept, Relation, Source
from app.storage.quota import QuotaService, text_bytes


def seed_knowledge(session, user, name="Vector Search"):
    concept = Concept(user_id=user.id, name=name, slug=slugify(name))
    session.add(concept)
    session.flush()
    items = [
        (name, "An overview of searching by meaning rather than by exact keyword matching alone."),
        ("HNSW", "Hierarchical navigable small worlds, the index most vector databases reach for by default."),
        ("IVF", "Inverted file indexes partition the space into cells and search only the nearest few of them."),
    ]
    artifacts = []
    for title, body in items:
        artifact = Artifact(user_id=user.id, concept_id=concept.id,
                            slug=f"{concept.slug}-{slugify(title)}", title=title,
                            body=body, summary=body, tags=[])
        session.add(artifact)
        artifacts.append(artifact)
    session.flush()
    for artifact in artifacts:
        session.add(Source(artifact_id=artifact.id, source_type=SourceType.DOCS,
                           title=name, url="https://example.com/docs"))
    for artifact in artifacts[1:]:
        session.add(Relation(user_id=user.id, from_id=artifact.id,
                             to_id=artifacts[0].id, relation_type=RelationType.PART_OF))
    QuotaService(session, user).reserve(sum(text_bytes(a.body, a.summary) for a in artifacts))
    session.flush()
