"""Optional LLM enricher (DeepSeek, OpenAI-compatible) behind the `Enricher` protocol.

It is a strict *upgrade layer*, never load-bearing:

  1. the deterministic enricher runs first, so every entry always has a summary + tags;
  2. then the largest N entries (where a good summary pays off most) are re-enriched by the LLM;
  3. any failure — no key, timeout, bad JSON — silently leaves the deterministic result in place.

Enabled only when `llm_enrichment` is set and an API key is present, so the default pipeline
stays fully deterministic and offline. The network call is injected (`CompletionFn`) so the
prompt/parse logic is unit-tested without hitting the network.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

import httpx

from app.config import Settings
from app.enrich import DeterministicEnricher, Enricher
from app.models import DocMeta, EntryDraft

log = logging.getLogger(__name__)

# (system_prompt, user_prompt) -> assistant content string.
CompletionFn = Callable[[str, str], str]

_BODY_LIMIT = 6000  # chars of body sent to the model — enough context, bounded cost
_SUMMARY_LIMIT = 320
_MAX_TAGS = 6
_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

_SYSTEM = (
    "You distill a documentation or book section into search metadata for a calm learning app. "
    "Reply with ONLY a JSON object: {\"summary\": string, \"tags\": string[]}. "
    "The summary is 1-2 plain sentences (<= 300 chars) stating what the section teaches — no "
    "marketing, no 'this section'. Tags are 3-6 lowercase topical keywords a learner would "
    "search by (concepts and proper nouns, not generic words like 'guide' or 'example')."
)


def _user_prompt(title: str, body: str) -> str:
    return f"# {title}\n\n{body[:_BODY_LIMIT]}"


def _parse(content: str) -> tuple[str | None, list[str] | None]:
    """Pull (summary, tags) out of the model's reply, tolerating code fences and junk."""
    try:
        data = json.loads(_JSON_FENCE.sub("", content).strip())
    except (json.JSONDecodeError, TypeError):
        return None, None
    if not isinstance(data, dict):
        return None, None

    summary = data.get("summary")
    summary = summary.strip()[:_SUMMARY_LIMIT] if isinstance(summary, str) and summary.strip() else None

    raw_tags = data.get("tags")
    tags: list[str] | None = None
    if isinstance(raw_tags, list):
        seen: list[str] = []
        for tag in raw_tags:
            if isinstance(tag, str) and tag.strip():
                clean = tag.strip().lower()
                if clean not in seen:
                    seen.append(clean)
        tags = seen[:_MAX_TAGS] or None
    return summary, tags


def deepseek_completion(
    api_key: str, *, model: str, base_url: str, timeout: float
) -> CompletionFn:
    """A CompletionFn backed by DeepSeek's OpenAI-compatible chat-completions endpoint."""

    def complete(system: str, user: str) -> str:
        response = httpx.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "stream": False,
            },
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    return complete


class LLMEnricher:
    """Deterministic baseline, upgraded on the biggest entries by an injected completion fn."""

    def __init__(
        self,
        complete: CompletionFn,
        *,
        max_entries: int = 60,
        concurrency: int = 6,
        fallback: Enricher | None = None,
    ) -> None:
        self._complete = complete
        self._max_entries = max_entries
        self._concurrency = concurrency
        self._fallback = fallback or DeterministicEnricher()

    def enrich_all(self, drafts: list[EntryDraft], meta: DocMeta) -> None:
        self._fallback.enrich_all(drafts, meta)  # guarantee every entry has something

        targets = sorted(drafts, key=lambda d: len(d.body_md), reverse=True)
        targets = [d for d in targets if d.body_md.strip()][: self._max_entries]
        if not targets:
            return

        workers = max(1, min(self._concurrency, len(targets)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = pool.map(self._enrich_one, targets)

        upgraded = 0
        for draft, result in zip(targets, results, strict=True):
            summary, tags = result
            if summary:
                draft.summary = summary
                upgraded += 1
            if tags:
                draft.tags = tags
        log.info("LLM-enriched %d/%d entries", upgraded, len(targets))

    def _enrich_one(self, draft: EntryDraft) -> tuple[str | None, list[str] | None]:
        try:
            content = self._complete(_SYSTEM, _user_prompt(draft.title, draft.body_md))
            return _parse(content)
        except Exception as error:  # any failure -> keep the deterministic result
            log.warning("LLM enrichment failed for %r: %s", draft.title, error)
            return None, None


def enricher_from_settings(settings: Settings) -> Enricher | None:
    """Build the LLM enricher when configured, else None (caller uses the deterministic default)."""
    if not (settings.llm_enrichment and settings.deepseek_api_key):
        return None
    complete = deepseek_completion(
        settings.deepseek_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout,
    )
    log.info("LLM enrichment enabled (model=%s)", settings.llm_model)
    return LLMEnricher(complete, max_entries=settings.llm_max_entries)
