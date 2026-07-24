"""[3] Segmenter: StructuredDocument -> ArtifactDraft list (one per readable section).

Deterministic. A heading becomes its own entry only down to `max_split_level`; deeper
headings are *folded into* their nearest ancestor entry's body (heading preserved as markdown),
so entries stay substantial and readable instead of fragmenting into one-line H4/H5 nodes.
Short leaf sections still merge up into their parent. The `source_key` is stable across
re-imports (scope + breadcrumb path), which is what makes re-imports idempotent.
"""

from __future__ import annotations

from app.pipeline.models import ArtifactDraft, Section, StructuredDocument
from app.core.slugify import slugify

# Split into separate entries down to H2 (pages + major sections); fold H3+ into the
# section body so each entry reads as one substantial, self-contained unit rather than a
# stub whose real content lives in a swarm of one-paragraph child entries.
DEFAULT_MAX_SPLIT_LEVEL = 2


def _source_key(scope: str, breadcrumb: list[str]) -> str:
    path = "/".join(slugify(crumb) or "section" for crumb in breadcrumb)
    return f"{scope}::{path}"


def _disambiguate(key: str, taken: dict[str, int]) -> str:
    """Sibling sections may repeat a heading, but the key is the idempotency key — it must be
    unique. Numbering by occurrence keeps it stable across re-imports of the same document."""
    taken[key] = taken.get(key, 0) + 1
    return key if taken[key] == 1 else f"{key}~{taken[key]}"


def _find(drafts: list[ArtifactDraft], key: str) -> ArtifactDraft | None:
    for draft in reversed(drafts):  # parent was added recently
        if draft.source_key == key:
            return draft
    return None


def _render(section: Section) -> str:
    """Render a section and all its descendants back to markdown (for folding into a body)."""
    parts: list[str] = []
    if section.title is not None and section.level >= 1:
        hashes = "#" * min(max(section.level, 1), 6)
        parts.append(f"{hashes} {section.title}")
    if section.content_md.strip():
        parts.append(section.content_md.strip())
    for child in section.children:
        rendered = _render(child)
        if rendered:
            parts.append(rendered)
    return "\n\n".join(parts).strip()


def _collect_links(section: Section) -> list[str]:
    links = list(section.links)
    for child in section.children:
        links.extend(_collect_links(child))
    return links


def segment(
    doc: StructuredDocument,
    *,
    scope: str,
    min_artifact_chars: int,
    max_split_level: int = DEFAULT_MAX_SPLIT_LEVEL,
) -> list[ArtifactDraft]:
    drafts: list[ArtifactDraft] = []
    taken: dict[str, int] = {}

    def walk(section: Section, breadcrumb: list[str], parent_key: str | None) -> None:
        title = section.title or doc.meta.title
        crumb = [*breadcrumb, title]

        # Too deep to be its own entry: fold the whole subtree into the parent's body.
        if section.level > max_split_level and parent_key is not None:
            parent = _find(drafts, parent_key)
            rendered = _render(section)
            if parent is not None and rendered:
                parent.body_md = f"{parent.body_md}\n\n{rendered}".strip()
                parent.out_links.extend(_collect_links(section))
            return

        body = section.content_md.strip()

        # A short leaf merges up into its parent instead of becoming a one-line entry.
        if not section.children and parent_key is not None and len(body) < min_artifact_chars:
            parent = _find(drafts, parent_key)
            if parent is not None and body:
                heading = "#" * min(max(section.level, 1), 6)
                parent.body_md = f"{parent.body_md}\n\n{heading} {title}\n\n{body}".strip()
                parent.out_links.extend(section.links)
            return

        # Claimed only once a draft is really being made, so folded sections don't consume numbers.
        key = _disambiguate(_source_key(scope, crumb), taken)
        drafts.append(
            ArtifactDraft(
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
    return _fill_empty(drafts)


def _fill_empty(drafts: list[ArtifactDraft]) -> list[ArtifactDraft]:
    """No entry should read blank. Give an empty *hub* a table-of-contents body listing its
    children; drop an empty *leaf* entirely (it carries nothing)."""
    children: dict[str, list[ArtifactDraft]] = {}
    for draft in drafts:
        if draft.parent_key is not None:
            children.setdefault(draft.parent_key, []).append(draft)

    kept: list[ArtifactDraft] = []
    for draft in drafts:
        if draft.body_md.strip():
            kept.append(draft)
            continue
        kids = children.get(draft.source_key)
        if kids:
            draft.body_md = "\n".join(f"- {kid.title}" for kid in kids)
            kept.append(draft)
        # else: empty leaf — drop it (its PART_OF edge to a parent carries no content).
    return kept
