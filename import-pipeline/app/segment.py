"""[3] Segmenter: StructuredDocument -> EntryDraft list (one per subsection).

Deterministic. Each heading node becomes an entry whose body is its own content; child
headings become their own entries linked by `parent_key` (PART_OF). Short leaf sections
merge up into their parent so we don't emit one-sentence entries. The `source_key` is stable
across re-imports (scope + breadcrumb path), which is what makes re-imports idempotent.
"""

from __future__ import annotations

from app.models import EntryDraft, StructuredDocument
from app.slugify import slugify


def _source_key(scope: str, breadcrumb: list[str]) -> str:
    path = "/".join(slugify(crumb) or "section" for crumb in breadcrumb)
    return f"{scope}::{path}"


def _find(drafts: list[EntryDraft], key: str) -> EntryDraft | None:
    for draft in reversed(drafts):  # parent was added recently
        if draft.source_key == key:
            return draft
    return None


def segment(
    doc: StructuredDocument, *, scope: str, min_entry_chars: int
) -> list[EntryDraft]:
    drafts: list[EntryDraft] = []

    def walk(section, breadcrumb: list[str], parent_key: str | None) -> None:
        title = section.title or doc.meta.title
        crumb = [*breadcrumb, title]
        key = _source_key(scope, crumb)
        body = section.content_md.strip()

        # A short leaf merges up into its parent instead of becoming its own entry.
        if not section.children and parent_key is not None and len(body) < min_entry_chars:
            parent = _find(drafts, parent_key)
            if parent is not None and body:
                heading = "#" * min(max(section.level, 1), 6)
                parent.body_md = f"{parent.body_md}\n\n{heading} {title}\n\n{body}".strip()
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
            )
        )
        for child in section.children:
            walk(child, crumb, key)

    walk(doc.root, [], None)
    return drafts
