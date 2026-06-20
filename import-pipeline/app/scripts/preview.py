"""Dry-run an import: build the MappedImport from a source and print stats, without writing
to the database. Useful for eyeballing segmentation quality.

Usage:
  uv run python -m app.scripts.preview url     https://adk.dev/
  uv run python -m app.scripts.preview article https://en.wikipedia.org/wiki/Knowledge_graph
  uv run python -m app.scripts.preview md      ./notes.md
  uv run python -m app.scripts.preview pdf     ./paper.pdf
"""

from __future__ import annotations

import sys

from app.models import RelationType
from app.pipeline import build_import
from app.sources import article, markdown, pdf, website
from app.sources.base import SourceResult


def _load(kind: str, target: str) -> SourceResult:
    if kind == "url":
        return website.from_website(target)
    if kind == "article":
        return article.from_article_url(target)
    if kind == "md":
        return markdown.from_markdown_file(target)
    if kind == "pdf":
        with open(target, "rb") as handle:
            return pdf.from_pdf_bytes(handle.read(), filename=target)
    raise SystemExit(f"unknown kind: {kind!r} (use url|article|md|pdf)")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: preview <url|article|md|pdf> <target>")
    kind, target = sys.argv[1], sys.argv[2]

    result = _load(kind, target)
    mapped = build_import(
        result.doc, collection_name=result.suggested_collection, scope=result.scope
    )
    part_of = sum(1 for r in mapped.relations if r.relation_type == RelationType.PART_OF)
    see_also = sum(1 for r in mapped.relations if r.relation_type == RelationType.SEE_ALSO)

    print(f"collection : {result.suggested_collection}")
    print(f"scope      : {result.scope}")
    print(f"entries    : {len(mapped.entries)}")
    print(f"relations  : {len(mapped.relations)}  (PART_OF={part_of}, SEE_ALSO={see_also})")
    print("sample entries:")
    for entry in mapped.entries[:18]:
        indent = "  " * entry.metadata["headingLevel"]
        tags = ", ".join(entry.tags)
        print(f"  {indent}- {entry.title}   [tags: {tags}]")
    if len(mapped.entries) > 18:
        print(f"  ... ({len(mapped.entries)} total)")


if __name__ == "__main__":
    main()
