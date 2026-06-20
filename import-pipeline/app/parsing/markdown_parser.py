"""Markdown -> StructuredDocument.

Hand-rolled heading-tree builder (no markdown dependency): it splits on ATX headings while
respecting fenced code blocks, keeps each section's own content as markdown, and records the
links inside each section for later SEE_ALSO resolution. Used both as the Markdown source
adapter and as the normalizer for `llms-full.txt` / sitemap page text.
"""

from __future__ import annotations

import re

from app.models import DocMeta, Section, SourceType, StructuredDocument
from app.slugify import slugify

_HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_FENCE = re.compile(r"^[ \t]*(```|~~~)")
_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:[ \t]+\"[^\"]*\")?\)")
_FRONTMATTER = re.compile(r"^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n", re.DOTALL)
_FM_TITLE = re.compile(r"^title:[ \t]*(.+?)[ \t]*$", re.MULTILINE)


def _extract_links(text: str) -> list[str]:
    return _LINK.findall(text)


def _strip_frontmatter(text: str) -> tuple[str | None, str]:
    """Return (frontmatter title or None, body without the frontmatter block)."""
    match = _FRONTMATTER.match(text)
    if not match:
        return None, text
    title_match = _FM_TITLE.search(match.group(1))
    title = title_match.group(1).strip().strip("\"'") if title_match else None
    return title, text[match.end():]


def parse_markdown(
    text: str,
    *,
    fallback_title: str,
    source_type: SourceType,
    source_url: str | None = None,
) -> StructuredDocument:
    fm_title, body = _strip_frontmatter(text)

    root = Section(title=fallback_title, level=0)
    stack: list[Section] = [root]
    buffer: list[str] = []
    in_fence = False

    def flush() -> None:
        if not buffer:
            return
        chunk = "\n".join(buffer).strip("\n")
        section = stack[-1]
        section.content_md = f"{section.content_md}\n{chunk}".strip() if section.content_md else chunk
        section.links.extend(_extract_links(chunk))
        buffer.clear()

    for line in body.splitlines():
        if _FENCE.match(line):
            in_fence = not in_fence
            buffer.append(line)
            continue
        if not in_fence:
            heading = _HEADING.match(line)
            if heading:
                flush()
                level = len(heading.group(1))
                title = heading.group(2).strip()
                while stack[-1].level >= level:
                    stack.pop()
                section = Section(title=title, level=level, anchor=slugify(title))
                stack[-1].children.append(section)
                stack.append(section)
                continue
        buffer.append(line)
    flush()

    # Collapse a redundant wrapper: a single H1 with no preamble becomes the document root,
    # so we don't emit an empty "fallback title" overview entry above it.
    if not root.content_md and len(root.children) == 1 and root.children[0].level == 1:
        only = root.children[0]
        root = Section(
            title=only.title,
            level=0,
            content_md=only.content_md,
            anchor=only.anchor,
            links=only.links,
            children=only.children,
        )

    title = fm_title or root.title or fallback_title
    root.title = title
    if root.anchor is None:
        root.anchor = slugify(title)

    meta = DocMeta(title=title, source_type=source_type, source_url=source_url)
    return StructuredDocument(meta=meta, root=root)
