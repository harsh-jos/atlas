"""The pipeline and knowledge base, bound to one user, as callables an LlmAgent can hold.

Tool docstrings are the model's contract, so they are written for the model, not the reader.
"""

from collections.abc import Callable
from uuid import UUID

from sqlalchemy.orm import Session

from app.auth.repository import UserRepository
from app.core.config import get_settings
from app.db.base import SessionScope
from app.db.models import User
from app.pipeline.build import build_import
from app.pipeline.loader import load_source
from app.pipeline.preview import PreviewService
from app.search import search_artifacts


def build_toolkit(scope: SessionScope, user_id: UUID) -> list[Callable]:
    """Tools bound to one user; every call takes a short-lived session of its own."""

    def owner(session: Session) -> User:
        user = UserRepository(session).get(user_id)
        if user is None:
            raise LookupError(f"user {user_id} no longer exists")
        return user

    def search_knowledge_base(query: str) -> dict:
        """Search what this person has ALREADY learned and kept.

        Call this before searching the web, every time. If they already hold artifacts on the
        topic, say so and offer to extend that concept instead of importing the same thing twice.

        Args:
            query: words describing the topic, e.g. "vector index HNSW".

        Returns:
            results: matching artifacts, each with slug, title, summary and concept name.
            An empty list means they have nothing on this yet.
        """
        with scope() as session:
            return {"results": search_artifacts(session, user_id, query)}

    def preview_source(url: str, concept_name: str = "") -> dict:
        """Fetch a source and show exactly which artifacts it would become. Writes NOTHING.

        Use this the moment a specific source is agreed on — including when the person named
        the source themselves, in which case do not search the web at all. Present the returned
        artifact list to them and ask which ones they want before committing anything.

        Args:
            url: the page or documentation site to read.
            concept_name: what to call the group of artifacts; leave empty to infer it.

        Returns:
            previewId: pass this to commit_artifacts once the person has chosen.
            artifacts: every artifact this source would create, with sourceKey, title,
            breadcrumb and size in bytes. sourceKey is what commit_artifacts expects.
            totalBytes: size of the whole source, all artifacts combined.
            alreadyKnown: artifacts the person ALREADY has on this topic. If this is not
            empty, tell them before they choose — they may want to extend rather than duplicate.
        """
        settings = get_settings()
        loaded = load_source("url", {"url": url})
        mapped = build_import(
            loaded.doc,
            concept_name=concept_name or loaded.suggested_concept,
            scope=loaded.scope,
            min_artifact_chars=settings.min_artifact_chars,
            max_split_level=settings.max_split_level,
        )
        with scope() as session:
            service = PreviewService(session, owner(session))
            preview = service.park(mapped, scope=loaded.scope)
            outline = service.outline(preview.id)
            # Checked here, not left to the model: a prompt cannot guarantee a tool call.
            related = search_artifacts(session, user_id, mapped.concept.name)
            return {
                "previewId": str(preview.id),
                "artifacts": outline,
                "totalBytes": sum(item["bytes"] for item in outline),
                "alreadyKnown": related,
            }

    def commit_artifacts(preview_id: str, source_keys: list[str]) -> dict:
        """Write the artifacts the person explicitly chose into their knowledge base.

        Never call this until they have seen a preview and said which artifacts they want.
        Passing an empty source_keys list commits the entire preview, so only do that when they
        asked for all of it.

        Args:
            preview_id: previewId returned by preview_source.
            source_keys: the sourceKey of each artifact they chose.

        Returns:
            conceptSlug, artifacts written, relations created, pruned, and bytes charged.
        """
        with scope() as session:
            service = PreviewService(session, owner(session))
            return dict(service.commit(UUID(preview_id), source_keys or None))

    return [search_knowledge_base, preview_source, commit_artifacts]
