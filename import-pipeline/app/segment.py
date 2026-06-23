"""[3] Segmenter: StructuredDocument -> EntryDraft list (one per subsection).

Deterministic. Each heading node becomes an entry whose body is its own content; child
headings become their own entries linked by `parent_key` (PART_OF). Three shaping rules keep
the output clean:

  * short leaves merge up into their parent (no one-sentence entries);
  * heading-only parents are kept but flagged `structural` (they anchor the hierarchy, but
    carry no body — we don't fabricate one);
  * oversized bodies split at paragraph boundaries into PART_OF continuations, so no entry is
    too large to read or to embed later.

The `source_key` is stable across re-imports (scope + breadcrumb path), and each entry carries
its own page `source_url` (provenance + cross-page link resolution).
"""

from __future__ import annotations

import re

from app.models import EntryDraft, StructuredDocument
from app.slugify import slugify

DEFAULT_MAX_ENTRY_CHARS = 8000

_PARAGRAPH_BREAK = re.compile(r"\n\s*\n")


def _source_key(scope: str, breadcrumb: list[str]) -> str:
    path = "/".join(slugify(crumb) or "section" for crumb in breadcrumb)
    return f"{scope}::{path}"


def _find(drafts: list[EntryDraft], key: str) -> EntryDraft | None:
    for draft in reversed(drafts):  # parent was added recently
        if draft.source_key == key:
            return draft
    return None


def _pack(units: list[str], joiner: str, max_chars: int) -> list[str]:
    """Greedily pack `units` into chunks no larger than `max_chars`, joined by `joiner`."""
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for unit in units:
        addition = len(unit) + (len(joiner) if current else 0)
        if current and current_len + addition > max_chars:
            chunks.append(joiner.join(current))
            current, current_len = [unit], len(unit)
        else:
            current.append(unit)
            current_len += addition
    if current:
        chunks.append(joiner.join(current))
    return chunks


def _split_body(body: str, max_chars: int) -> list[str]:
    """Split an oversized body, preferring paragraph boundaries and falling back to line
    boundaries for a block that has none (a long list or reference section). A single line
    longer than `max_chars` is left whole rather than broken mid-content."""
    chunks: list[str] = []
    for block in _pack(_PARAGRAPH_BREAK.split(body), "\n\n", max_chars):
        if len(block) <= max_chars or "\n" not in block:
            chunks.append(block)
        else:
            chunks.extend(_pack(block.split("\n"), "\n", max_chars))
    return chunks


def _split_oversized(drafts: list[EntryDraft], max_chars: int) -> list[EntryDraft]:
    """Expand any entry whose body exceeds `max_chars` into a first part plus PART_OF
    continuation entries, preserving reading order."""
    result: list[EntryDraft] = []
    for draft in drafts:
        if draft.structural or len(draft.body_md) <= max_chars:
            result.append(draft)
            continue
        chunks = _split_body(draft.body_md, max_chars)
        if len(chunks) <= 1:  # one indivisible oversized block — leave it whole
            result.append(draft)
            continue

        total = len(chunks)
        draft.body_md = chunks[0]
        result.append(draft)
        for index, chunk in enumerate(chunks[1:], start=2):
            part_title = f"{draft.title} (part {index}/{total})"
            result.append(
                EntryDraft(
                    source_key=f"{draft.source_key}/part-{index}",
                    title=part_title,
                    breadcrumb=[*draft.breadcrumb[:-1], part_title],
                    level=draft.level,
                    body_md=chunk,
                    parent_key=draft.source_key,
                    source_url=draft.source_url,
                )
            )
    return result


def segment(
    doc: StructuredDocument,
    *,
    scope: str,
    min_entry_chars: int,
    max_entry_chars: int = DEFAULT_MAX_ENTRY_CHARS,
) -> list[EntryDraft]:
    drafts: list[EntryDraft] = []

    def walk(section, breadcrumb: list[str], parent_key: str | None, page_url: str | None) -> None:
        title = section.title or doc.meta.title
        crumb = [*breadcrumb, title]
        key = _source_key(scope, crumb)
        body = section.content_md.strip()
        page_url = section.source_url or page_url  # nearest ancestor's page wins

        # A short leaf merges up into its parent instead of becoming its own entry.
        if not section.children and parent_key is not None and len(body) < min_entry_chars:
            parent = _find(drafts, parent_key)
            if parent is not None and body:
                heading = "#" * min(max(section.level, 1), 6)
                parent.body_md = f"{parent.body_md}\n\n{heading} {title}\n\n{body}".strip()
                parent.structural = False  # it now has prose of its own, no longer just an anchor
            return

        drafts.append(
            EntryDraft(
                source_key=key,
                title=title,
                breadcrumb=crumb,
                level=section.level,
                body_md=body,
                parent_key=parent_key,
                anchor=section.anchor,
                out_links=list(section.links),
                source_url=page_url,
                # A heading with children but no prose of its own is a structural node.
                structural=not body and bool(section.children),
            )
        )
        for child in section.children:
            walk(child, crumb, key, page_url)

    walk(doc.root, [], None, doc.root.source_url or doc.meta.source_url)
    return _split_oversized(drafts, max_entry_chars)
