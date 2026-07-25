"""Typing candidate pairs. Retrieval says *related*; only judgement says *how*."""

import json
import logging
from collections.abc import Sequence
from typing import Protocol

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.agent.session import configure_vertex
from app.core.config import get_settings
from app.core.enums import RelationType
from app.db.models import Artifact

log = logging.getLogger(__name__)

INSTRUCTION = """You are typing edges in someone's personal knowledge base.

For each numbered pair, decide whether a *real, useful* relationship holds from A to B. Most
pairs are merely on the same topic — that is NOT a relationship worth recording. Omit them.

Relation types:
- PREREQUISITE: A should be understood before B. The most valuable type; look for it first.
- PART_OF: A is a component or subsection of B.
- USES: A applies or depends on B.
- CONTRASTS: A is an alternative to B, or they differ in a way worth knowing.
- SEE_ALSO: genuinely related but none of the above. Use this LAST, not as a default.

Set reversed=true when the relation actually runs from B to A.
Give a confidence between 0 and 1, and a note of at most twelve words saying why.
Return an empty list rather than inventing edges."""


class Judgement(BaseModel):
    index: int
    relation_type: RelationType
    reversed: bool = False
    confidence: float
    note: str


class Judgements(BaseModel):
    edges: list[Judgement]


class Judge(Protocol):
    def type_pairs(self, pairs: Sequence[tuple[Artifact, Artifact]]) -> list[Judgement]: ...


def _describe(artifact: Artifact) -> str:
    return f"{artifact.title} — {(artifact.summary or '')[:200]}"


class GeminiJudge:
    """The agent's own model, asked for structured verdicts rather than prose."""

    def __init__(self) -> None:
        configure_vertex()
        self._model = get_settings().agent_model
        self._client = genai.Client()

    def type_pairs(self, pairs: Sequence[tuple[Artifact, Artifact]]) -> list[Judgement]:
        if not pairs:
            return []
        listing = "\n".join(
            f"{index}. A: {_describe(a)}\n   B: {_describe(b)}"
            for index, (a, b) in enumerate(pairs)
        )
        response = self._client.models.generate_content(
            model=self._model,
            contents=f"{INSTRUCTION}\n\nPairs:\n{listing}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=Judgements
            ),
        )
        try:
            return Judgements(**json.loads(response.text or "{}")).edges
        except (ValueError, TypeError):
            log.warning("could not parse edge judgements; proposing none for this batch")
            return []
