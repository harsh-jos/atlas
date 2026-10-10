"""ADK callbacks shared by the guide and its research tool."""

import asyncio
import re
from uuid import UUID, uuid4
from urllib.parse import quote, urlparse

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.genai import types

from app.agent.usage import AgentLimitReached, UsageStore
from app.core.config import Settings

INCOMPLETE_NOTICE = "This reply is incomplete. Ask me to continue from the last complete point."


class RequestLimits:
    def __init__(self, store: UsageStore, settings: Settings):
        self.store = store
        self.settings = settings
        self.invocation_id = str(uuid4())
        self.sources: dict[str, str] = {}
        self.pending: dict[tuple[str, str], list[UUID]] = {}
        self.truncated = False

    async def before_model(
        self, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> None:
        if len(llm_request.model_dump_json().encode()) > self.settings.agent_max_request_bytes:
            raise AgentLimitReached(
                "The conversation is too large for one request. Its history is saved."
            )
        research = callback_context.agent_name == "researcher"
        request_id = await asyncio.to_thread(
            self.store.reserve,
            self.invocation_id,
            llm_request.model or "unknown",
            research,
            self.settings,
        )
        key = (callback_context.agent_name, callback_context.invocation_id)
        self.pending.setdefault(key, []).append(request_id)

    async def after_model(
        self, callback_context: CallbackContext, llm_response: LlmResponse
    ) -> None:
        if llm_response.partial:
            return
        pending = self.pending.get(
            (callback_context.agent_name, callback_context.invocation_id), []
        )
        if not pending:
            return
        request_id = pending.pop(0)
        grounding = llm_response.grounding_metadata
        if grounding:
            for chunk in grounding.grounding_chunks or []:
                if chunk.web and chunk.web.uri:
                    url = chunk.web.uri
                    if urlparse(url).scheme in ("https", "http"):
                        self.sources[url] = chunk.web.title or "Source"
        usage = llm_response.usage_metadata
        await asyncio.to_thread(
            self.store.record,
            request_id,
            reported=bool(usage and usage.total_token_count is not None),
            input_tokens=usage.prompt_token_count or 0 if usage else 0,
            output_tokens=usage.candidates_token_count or 0 if usage else 0,
            thought_tokens=usage.thoughts_token_count or 0 if usage else 0,
            total_tokens=usage.total_token_count or 0 if usage else 0,
            search_queries=len(grounding.web_search_queries or []) if grounding else 0,
        )
        if llm_response.finish_reason == types.FinishReason.MAX_TOKENS:
            self.truncated = True
        if (
            self.truncated
            and llm_response.content
            and (
                llm_response.finish_reason == types.FinishReason.MAX_TOKENS
                or callback_context.agent_name == "atlas"
            )
        ):
            if not any(part.function_call for part in llm_response.content.parts or []):
                llm_response.content.parts = [
                    *(llm_response.content.parts or []),
                    types.Part(text="\n\n" + INCOMPLETE_NOTICE),
                ]

        if callback_context.agent_name == "atlas" and llm_response.content:
            parts = llm_response.content.parts or []
            visible = "".join(part.text or "" for part in parts if not part.thought)
            if (
                self.sources
                and not any(part.function_call for part in parts)
                and not re.search(r"\[[^\]]+\]\(https?://", visible)
            ):
                links = []
                for url, title in list(self.sources.items())[:3]:
                    label = re.sub(r"[\[\]\n\r]", "", title)[:100]
                    links.append(f"[{label}]({quote(url, safe='/:?&=#%+-_.~')})")
                parts.append(types.Part(text="\n\nSources: " + " · ".join(links)))
                llm_response.content.parts = parts
