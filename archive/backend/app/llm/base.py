"""The provider-neutral LLM surface every caller writes against.

Two operations cover everything the KB pipeline (and future callers) need:
`parse` for structured output validated against a pydantic schema, and `write`
for long-form prose. Providers differ in how they honour these — native JSON
schema on Gemini, JSON mode plus repair on OpenAI-compatible APIs — but the
interior of the app never sees the difference.
"""

from __future__ import annotations

import json
import re
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

SchemaT = TypeVar("SchemaT", bound=BaseModel)

_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class LLMError(RuntimeError):
    """Any provider failure the pipeline should surface rather than swallow."""


class LLMClient(Protocol):
    provider: str
    model: str
    usage: dict[str, int]

    def parse(
        self, *, system: str, user: str, schema: type[SchemaT], max_tokens: int = 8192
    ) -> SchemaT: ...

    def write(self, *, system: str, user: str, max_tokens: int = 16384) -> str: ...


def new_usage() -> dict[str, int]:
    return {"input_tokens": 0, "output_tokens": 0, "calls": 0}


def schema_instruction(schema: type[BaseModel]) -> str:
    """The schema, stated in the prompt — the portable half of structured output.

    Providers with native enforcement use it as reinforcement; providers with
    only a JSON mode depend on it.
    """
    return (
        "Respond with ONLY a JSON object matching this JSON Schema — no prose, "
        "no markdown fences:\n" + json.dumps(schema.model_json_schema(), indent=2)
    )


def parse_json_reply(content: str, schema: type[SchemaT]) -> SchemaT:
    """Validate a model reply against the schema, tolerating fences and chatter."""
    text = _JSON_FENCE.sub("", content).strip()
    if not text.startswith(("{", "[")):
        start = text.find("{")
        if start == -1:
            raise LLMError(f"reply contains no JSON object: {text[:200]!r}")
        text = text[start:]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise LLMError(f"reply is not valid JSON: {error}") from error
    try:
        return schema.model_validate(data)
    except ValidationError as error:
        raise LLMError(f"reply does not match {schema.__name__}: {error}") from error
