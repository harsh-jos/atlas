"""Deterministic markdown structure analysis: headings, prose lead, sizing.

Line-based and fence-aware, in the spirit of graphify's markdown extractor —
no markdown library, no LLM.
"""
from __future__ import annotations

import re

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)")


def _lines_outside_fences(markdown: str):
    in_fence = False
    for line in markdown.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            yield line


def headings_of(markdown: str, max_headings: int = 30) -> list[str]:
    out: list[str] = []
    for line in _lines_outside_fences(markdown):
        m = _HEADING_RE.match(line)
        if m:
            out.append(m.group(2).strip())
            if len(out) >= max_headings:
                break
    return out


def word_count_of(markdown: str) -> int:
    return sum(len(line.split()) for line in _lines_outside_fences(markdown))


def lead_text(markdown: str, max_chars: int = 700) -> str:
    """First prose paragraphs — the page's own introduction, skipping
    headings, images, and link-only lines that survive extraction."""
    chunks: list[str] = []
    total = 0
    for line in _lines_outside_fences(markdown):
        stripped = line.strip()
        if not stripped or _HEADING_RE.match(stripped) or stripped.startswith(("![", "|")):
            continue
        # a line that is nothing but links is navigation residue
        if re.fullmatch(r"(?:\[[^\]]*\]\([^)]*\)[\s·,|-]*)+", stripped):
            continue
        chunks.append(stripped)
        total += len(stripped)
        if total >= max_chars:
            break
    return " ".join(chunks)[:max_chars]


def trim_to_chars(markdown: str, max_chars: int) -> str:
    """Trim at a heading boundary where possible, else hard-cut at a line."""
    if len(markdown) <= max_chars:
        return markdown
    lines = markdown.splitlines(keepends=True)
    out: list[str] = []
    total = 0
    last_heading_idx = None
    for line in lines:
        if total + len(line) > max_chars:
            break
        if _HEADING_RE.match(line.strip()):
            last_heading_idx = len(out)
        out.append(line)
        total += len(line)
    # cut back to the last heading so we never end mid-section, unless that
    # would discard most of what fit
    if last_heading_idx is not None and last_heading_idx > len(out) // 2:
        out = out[:last_heading_idx]
    return "".join(out).rstrip() + "\n\n[... trimmed for length ...]\n"
