"""Decide whether a fetched body is usable markdown — by structure, not by its first byte.

The old heuristic rejected anything starting with `<`, which silently discarded valid
`llms-full.txt` files that open with an `<SYSTEM>…</SYSTEM>` instruction block (a common
llms.txt convention — e.g. hono.dev). That turned the best, lossless source into a homepage
scrape without a word of warning. Here we strip the known preamble and judge by markdown
structure instead, so a real source is recognised and a real HTML error page still isn't.
"""

from __future__ import annotations

import re

# An optional leading instruction block some llms.txt files put at the very top for the LLM.
_SYSTEM_PREAMBLE = re.compile(r"^\s*<SYSTEM>.*?</SYSTEM>\s*", re.IGNORECASE | re.DOTALL)
_ATX_HEADING = re.compile(r"^#{1,6}\s+\S", re.MULTILINE)
_HTML_PAGE = re.compile(r"^(?:<!doctype\b|<html\b)", re.IGNORECASE)

# Below this length, with no heading, a body is too thin to trust as a real document.
_MIN_PROSE_CHARS = 500


def strip_llm_preamble(text: str) -> str:
    """Remove a leading `<SYSTEM>…</SYSTEM>` block if present (llms.txt convention)."""
    return _SYSTEM_PREAMBLE.sub("", text, count=1)


def is_markdown_document(text: str) -> bool:
    """True if `text` looks like a real markdown document rather than an HTML error/landing page.

    Judged on the content *after* any `<SYSTEM>` preamble: a genuine HTML document is rejected,
    but markdown is accepted whether or not it has headings, as long as it has real body text.
    """
    body = strip_llm_preamble(text).lstrip()
    if _HTML_PAGE.match(body):
        return False
    return bool(_ATX_HEADING.search(body)) or len(body) >= _MIN_PROSE_CHARS
