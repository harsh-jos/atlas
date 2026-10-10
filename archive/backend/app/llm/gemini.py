"""Gemini via Vertex AI — credentials come from ADC (credentials.json), same as the agent."""

from __future__ import annotations

from pydantic import BaseModel

from app.llm.base import LLMError, SchemaT, new_usage, parse_json_reply, schema_instruction


class GeminiClient:
    provider = "gemini"

    def __init__(self, *, project: str, location: str, model: str):
        from google import genai  # deferred: importing configures auth state

        self.model = model
        self._client = genai.Client(vertexai=True, project=project, location=location)
        self.usage = new_usage()

    def _track(self, response) -> None:
        self.usage["calls"] += 1
        meta = getattr(response, "usage_metadata", None)
        if meta is not None:
            self.usage["input_tokens"] += meta.prompt_token_count or 0
            # Gemini 3.x thinks before answering; thought tokens are billed and
            # drawn from max_output_tokens, so they belong in the accounting.
            thoughts = getattr(meta, "thoughts_token_count", 0) or 0
            self.usage["output_tokens"] += (meta.candidates_token_count or 0) + thoughts

    @staticmethod
    def _truncated(response) -> bool:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return False
        return "MAX_TOKENS" in str(getattr(candidates[0], "finish_reason", ""))

    def parse(
        self, *, system: str, user: str, schema: type[SchemaT], max_tokens: int = 8192
    ) -> SchemaT:
        response = self._client.models.generate_content(
            model=self.model,
            contents=user,
            config={
                "system_instruction": system,
                "response_mime_type": "application/json",
                "response_schema": schema,
                "max_output_tokens": max_tokens,
            },
        )
        self._track(response)
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, BaseModel):
            return parsed  # type: ignore[return-value]
        # native parsing declined (schema too deep, model quirk) — repair path
        if not response.text:
            raise LLMError("Gemini returned an empty structured response")
        return parse_json_reply(response.text, schema)

    def write(self, *, system: str, user: str, max_tokens: int = 16384) -> str:
        response = self._client.models.generate_content(
            model=self.model,
            contents=user,
            config={"system_instruction": system, "max_output_tokens": max_tokens},
        )
        self._track(response)
        if self._truncated(response):
            # a silently chopped article is worse than a failed one
            raise LLMError(
                "Gemini hit max_output_tokens mid-answer (thinking tokens count "
                "against it) — retry with a larger max_tokens"
            )
        if not response.text:
            raise LLMError("Gemini returned an empty response")
        return response.text


# re-exported so the factory reads one symbol per provider module
__all__ = ["GeminiClient", "schema_instruction"]
