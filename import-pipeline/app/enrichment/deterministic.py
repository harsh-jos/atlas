"""No-LLM enricher: lead-paragraph summary + structural and keyword tags.

Fully deterministic and dependency-free. It is both the default enricher and the always-available
fallback the LLM enricher degrades to, so it must never fail. The in-house keyword extractor is
intentionally simple frequency ranking; swapping in YAKE/KeyBERT later is a one-function change.
"""

from __future__ import annotations

import re
from collections import Counter

from app.enrichment.base import MAX_TAGS
from app.models import DocMeta, EntryDraft
from app.slugify import slugify

_SUMMARY_LIMIT = 280

_CODE_FENCE = re.compile(r"```.*?```|~~~.*?~~~", re.DOTALL)
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_INLINE_NOISE = re.compile(r"[*_`>#]+")
_WS = re.compile(r"\s+")
_WORD = re.compile(r"[a-z][a-z0-9+#.\-]{2,}")

# Compact English stopword set — enough to keep frequency-based tags meaningful.
_STOPWORDS = frozenset(
    """a an and are as at be by for from has have how in into is it its of on or that the
    this to was were will with you your can may use used using also each other than then
    them they their there these those we our us if but not no all any one two when which
    what who whom while via per about above below over under more most such only same so
    some out up down new like first second example examples note default value values set
    get make made does do done able well within without across between among being been
    here where why http https www com org net io html href link links page""".split()
)


def _strip_code(md: str) -> str:
    return _CODE_FENCE.sub(" ", md)


def _clean_inline(text: str) -> str:
    text = _IMAGE.sub("", text)
    text = _LINK.sub(r"\1", text)  # keep link text, drop the URL
    text = _INLINE_NOISE.sub("", text)
    return _WS.sub(" ", text).strip()


def _summary(body_md: str) -> str | None:
    """First real prose paragraph, cleaned and trimmed to ~280 chars at a word boundary."""
    prose = _strip_code(body_md)
    for block in re.split(r"\n\s*\n", prose):
        cleaned = _clean_inline(block)
        if len(cleaned) < 24:  # skip stray lines, list fragments, leftover headings
            continue
        if len(cleaned) <= _SUMMARY_LIMIT:
            return cleaned
        cut = cleaned[:_SUMMARY_LIMIT].rsplit(" ", 1)[0].rstrip(",.;:")
        return f"{cut}…"
    return None


def _keywords(text: str, k: int) -> list[str]:
    counts: Counter[str] = Counter(
        word for word in _WORD.findall(text.lower()) if word not in _STOPWORDS
    )
    return [word for word, _ in counts.most_common(k)]


class DeterministicEnricher:
    """No-LLM enricher: lead-paragraph summary + structural and keyword tags."""

    def __init__(self, max_tags: int = MAX_TAGS) -> None:
        self._max_tags = max_tags

    def enrich(self, draft: EntryDraft, meta: DocMeta) -> None:
        draft.summary = _summary(draft.body_md)
        draft.tags = self._tags(draft, meta)
        draft.enriched_by = "deterministic"

    def _tags(self, draft: EntryDraft, meta: DocMeta) -> list[str]:
        title_slug = slugify(draft.title)
        # Clean links/images out first so URL fragments don't become tags.
        text = _clean_inline(_strip_code(draft.body_md))
        candidates = [meta.source_type.lower(), *_keywords(text, k=4)]

        tags: list[str] = []
        for raw in candidates:
            tag = raw.strip().lower()
            if tag and tag != title_slug and tag not in tags:
                tags.append(tag)
            if len(tags) >= self._max_tags:
                break
        return tags
