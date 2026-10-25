"""Agent tools scoped to the current user; each write commits before success is returned."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from google.adk.tools import ToolContext

from app.agent import knowledge
from app.agent.context import CONTEXT_KEY, PREFERENCES_KEY
from app.db.base import SessionScope
from app.search import search_artifacts
from app.storage.quota import QuotaExceeded
from app.core.errors import describe, report

log = logging.getLogger(__name__)


def build_toolkit(
    scope: SessionScope, user_id: UUID, *, session_id: str = "", turn_id: str = "", on_event: Callable[[dict], Awaitable[None]] | None = None
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

    async def create_artifact(concept_name: str, title: str, summary: str, content: str, kind: str = "components", source_urls: list[str] | None = None, user_requested: bool = False) -> dict:
        """Save a reusable learning artifact when requested or automatic saving is agreed.

        kind: markdown, components (same inline atlas component syntax), or simulation
        (self-contained HTML/CSS/JS in a sandbox, no network or host access). Include all
        necessary reasoning; use actual source URLs. Return the artifact URL after saving.
        Set user_requested only for an explicit save/create request. A simulation needs
        working controls, visible assumptions, and a useful explanation. No external scripts.
        """
        from app.agent.artifacts import create
        return await execute(create, concept_name, title, summary, content, kind, source_urls or [], user_requested, session_id, turn_id)

    async def update_artifact(slug: str, expected_updated_at: str, content: str, summary: str, kind: str, user_requested: bool = False) -> dict:
        """Revise an owned artifact after reading it. Preserves immutable prior revisions.

        Supply the timestamp returned by read_saved_explanation. Stale edits are rejected.
        kind is markdown, components, or simulation. Only revise when requested or agreed.
        """
        from app.agent.artifacts import revise
        return await execute(revise, slug, expected_updated_at, content, summary, kind, user_requested)

    async def generate_image(teaching_goal: str, factual_brief: str, composition: str, labels: list[str], aspect_ratio: str = "4:3") -> dict:
        """Generate and visually review one calm teaching illustration, embedded in this reply.

        Prefer native diagrams for exact graphs, formulas, code traces or plots. Describe
        what the reader should see and the factual constraints. At most two generations
        per turn, including rejected attempts. Only embed a returned reviewed assetId.
        This stores inline chat media, not a standalone library artifact.
        """
        from app.agent.images import create_image
        if not turn_id or not session_id:
            return await tool_error("generate_image", "missing_turn", "An active turn is required.")
        try:
            return await create_image(scope, user_id, session_id, turn_id, teaching_goal, factual_brief, composition, labels, aspect_ratio)
        except Exception as error:
            failure = describe(error)
            report(log, error, failure.code, tool="generate_image")
            return await tool_error("generate_image", failure.code, str(error) if isinstance(error, (ValueError, QuotaExceeded)) else "Image generation could not finish. Continue with a native diagram or prose.")

    async def read_source_page(url: str) -> dict:
        """Read a public HTTPS source page to verify claims; returns bounded untrusted text."""
        from app.agent.utilities import read_source
        try:
            return await asyncio.to_thread(read_source, url)
        except Exception:
            return await tool_error("read_source_page", "source_unavailable", "This source could not be read. Do not claim its contents were verified.")

    async def calculate(expression: str) -> dict:
        """Evaluate a small numeric arithmetic expression (+ - * / ** %), without executing code."""
        from app.agent.utilities import calculate as arithmetic
        try:
            return arithmetic(expression)
        except (ValueError, SyntaxError, ArithmeticError):
            return await tool_error("calculate", "invalid_calculation", "Supply finite numeric arithmetic using + - * / ** % only.")

    return [
        generate_image,
        read_source_page,
        calculate,
        search_knowledge_base,
        inspect_concept_graph,
        set_learning_preferences,
        remove_concept_connection,
        read_saved_explanation,
        create_artifact,
        update_artifact,
    ]
