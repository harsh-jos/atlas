"""Agent tools scoped to the current user; each write commits before success is returned."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from google.adk.tools import ToolContext

from app.agent import knowledge
from app.agent.context import CONTEXT_KEY, PREFERENCES_KEY, bounded_context
from app.db.base import SessionScope
from app.search import search_artifacts
from app.storage.quota import QuotaExceeded
from app.core.errors import describe, report

log = logging.getLogger(__name__)


def build_toolkit(
    scope: SessionScope, user_id: UUID, *, on_event: Callable[[dict], Awaitable[None]] | None = None
) -> list[Callable]:
    async def tool_error(name: str, code: str, message: str) -> dict:
        if on_event:
            await on_event({"type": "agent.tool_error", "name": name, "code": code, "message": message})
        return {"error": message, "code": code}

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
        return await tool_error(operation.__name__, code, message)

    async def search_knowledge_base(query: str) -> dict:
        """Find saved explanations by text. Exposure does not prove understanding."""
        result = await execute(search_artifacts, query[:200])
        return result if isinstance(result, dict) else {"results": result}

    async def inspect_concept_graph(tool_context: ToolContext, concept_slug: str = "") -> dict:
        """Read a concept's neighbours and explanations, or recent concepts if slug is empty.

        'requires' outgoing means this concept needs the neighbour; incoming is the reverse.
        'related_to' is symmetric. Results are bounded and indicate when more exist.
        """
        result = await execute(knowledge.neighbourhood, concept_slug)
        if "error" not in result:
            tool_context.state["temp:atlas_inspected_connections"] = [
                edge["connection_id"] for edge in result.get("connections", [])
            ]
        return result

    async def set_learning_preferences(
        tool_context: ToolContext, memory_enabled: bool | None = None, auto_save: bool | None = None
    ) -> dict:
        """Change only preferences explicitly requested by the user, across all their chats.

        memory_enabled controls concepts, connections, and conversation notes, not chat history.
        auto_save is a continuing agreement to save explanations. A single save is not agreement.
        Omitted fields keep their current values. Disabling memory clears this chat's notes.
        """
        result = await execute(knowledge.set_preferences, memory_enabled, auto_save)
        if "error" not in result:
            tool_context.state[PREFERENCES_KEY] = result
            if not result["memory_enabled"]:
                tool_context.state[CONTEXT_KEY] = {}
        return result

    async def update_learning_context(
        question: str, background: str, confusion: str, next_connection: str,
        tool_context: ToolContext,
    ) -> dict:
        """Replace compact conversation notes when the question or stated background changes.

        Record only the current question, stated background, unresolved confusion, and at most
        one optional connection. Empty strings clear fields. No private reasoning, sensitive
        personal data, mastery claims, or curriculum. Do not call on every narrow follow-up.
        Limits in characters: question 500, background/confusion 1000 each, next_connection 500.
        """
        result = await execute(knowledge.require_memory)
        if "error" in result:
            return result
        try:
            notes = bounded_context({"question": question, "background": background,
                                     "confusion": confusion, "next_connection": next_connection})
        except ValueError as error:
            return await tool_error("update_learning_context", "invalid_tool_input", str(error))
        tool_context.state[CONTEXT_KEY] = notes
        return {"updated": True}

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

    async def remove_concept_connection(
        connection_id: str, tool_context: ToolContext, user_requested: bool = False
    ) -> dict:
        """Remove one inspected connection only when the user explicitly requests it.

        Use the connection_id returned by inspect_concept_graph. To correct a connection,
        remove the wrong edge, then create the correct edge if memory is enabled.
        """
        if not user_requested:
            return await tool_error("remove_concept_connection", "invalid_tool_input",
                                    "Removing a connection requires a user request.")
        if connection_id not in tool_context.state.get("temp:atlas_inspected_connections", []):
            return await tool_error("remove_concept_connection", "invalid_tool_input",
                                    "Inspect this connection before removing it.")
        return await execute(knowledge.remove_connection, connection_id)

    async def read_saved_explanation(slug: str) -> dict:
        """Read an owned explanation and its revision timestamp before using or revising it."""
        return await execute(knowledge.read_explanation, slug)

    async def save_explanation(
        concept_slug: str, title: str, summary: str, body: str, source_urls: list[str],
        user_requested: bool = False,
    ) -> dict:
        """Save a standalone Markdown answer only when the user asks or has agreed to saving.

        Set user_requested only for an explicit one-time request; otherwise the stored
        auto_save preference must be enabled. Reuse source URLs actually retrieved.
        Same concept and title reuses the existing explanation without overwriting it.
        Return the reader URL to the user after success.
        """
        return await execute(
            knowledge.save_explanation, concept_slug, title, summary, body, source_urls, user_requested
        )

    async def revise_saved_explanation(
        slug: str, expected_updated_at: str, body: str, summary: str, user_requested: bool = False
    ) -> dict:
        """Revise an explanation when asked, after reading its current text and timestamp.

        Set user_requested only for an explicit request; otherwise auto_save must be enabled.
        Preserve relevant source citations and useful context. A stale timestamp rejects the edit.
        """
        return await execute(knowledge.revise_explanation, slug, expected_updated_at, body, summary, user_requested)

    return [
        search_knowledge_base,
        inspect_concept_graph,
        set_learning_preferences,
        update_learning_context,
        remember_concept,
        connect_concepts,
        remove_concept_connection,
        read_saved_explanation,
        save_explanation,
        revise_saved_explanation,
    ]
