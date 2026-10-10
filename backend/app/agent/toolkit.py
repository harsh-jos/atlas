"""Agent tools scoped to the current user; each write commits before success is returned."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from app.agent import knowledge
from app.db.base import SessionScope
from app.search import search_artifacts
from app.storage.quota import QuotaExceeded
from app.core.errors import describe, report

log = logging.getLogger(__name__)


def build_toolkit(
    scope: SessionScope, user_id: UUID, *, on_event: Callable[[dict], Awaitable[None]] | None = None
) -> list[Callable]:
    async def execute(operation, *args):
        def transaction():
            with scope() as session:
                return operation(session, user_id, *args)

        try:
            operation_task = asyncio.create_task(asyncio.to_thread(transaction))
            try:
                return await asyncio.shield(operation_task)
            except asyncio.CancelledError:
                # A database thread cannot be cancelled. Drain it before releasing the turn
                # so a new message cannot race a save that is still committing.
                try:
                    await operation_task
                except Exception as error:
                    report(log, error, describe(error).code, tool=operation.__name__)
                raise
        except (ValueError, QuotaExceeded) as error:
            code = "storage_quota" if isinstance(error, QuotaExceeded) else "invalid_tool_input"
            message = str(error)
        except Exception as error:
            failure = describe(error)
            code, message = failure.code, failure.message
            report(log, error, code, tool=operation.__name__)
        if on_event:
            await on_event({"type": "agent.tool_error", "name": operation.__name__, "code": code, "message": message})
        return {"error": message, "code": code}

    async def search_knowledge_base(query: str) -> dict:
        """Find saved explanations by text. Exposure does not prove understanding."""
        result = await execute(search_artifacts, query[:200])
        return result if isinstance(result, dict) else {"results": result}

    async def inspect_concept_graph(concept_slug: str = "") -> dict:
        """Read a concept's neighbours and explanations, or recent concepts if slug is empty.

        'requires' outgoing means this concept needs the neighbour; incoming is the reverse.
        'related_to' is symmetric. Results are bounded and indicate when more exist.
        """
        return await execute(knowledge.neighbourhood, concept_slug)

    async def remember_concept(name: str, description: str) -> dict:
        """Keep one concept actually explored, with a short plain-language description.

        Reuses an existing concept. Do not populate a curriculum or infer mastery.
        """
        return await execute(knowledge.remember_concept, name, description)

    async def connect_concepts(from_slug: str, to_slug: str, kind: str, note: str) -> dict:
        """Connect two existing concepts with a specific reason.

        kind is 'requires' (from needs to as a prerequisite) or symmetric 'related_to'.
        Use only meaningful connections supported by this exploration; duplicates are reused.
        """
        return await execute(knowledge.connect_concepts, from_slug, to_slug, kind, note)

    async def read_saved_explanation(slug: str) -> dict:
        """Read an owned explanation and its revision timestamp before using or revising it."""
        return await execute(knowledge.read_explanation, slug)

    async def save_explanation(
        concept_slug: str, title: str, summary: str, body: str, source_urls: list[str]
    ) -> dict:
        """Save a standalone Markdown answer only when the user asks or has agreed to saving.

        Reuse source URLs actually retrieved. Use a question as title when helpful.
        Same concept and title reuses the existing explanation without overwriting it.
        Return the reader URL to the user after success.
        """
        return await execute(
            knowledge.save_explanation, concept_slug, title, summary, body, source_urls
        )

    async def revise_saved_explanation(
        slug: str, expected_updated_at: str, body: str, summary: str
    ) -> dict:
        """Revise an explanation when asked, after reading its current text and timestamp.

        Preserve relevant source citations and useful context. A stale timestamp rejects the edit.
        """
        return await execute(knowledge.revise_explanation, slug, expected_updated_at, body, summary)

    return [
        search_knowledge_base,
        inspect_concept_graph,
        remember_concept,
        connect_concepts,
        read_saved_explanation,
        save_explanation,
        revise_saved_explanation,
    ]
