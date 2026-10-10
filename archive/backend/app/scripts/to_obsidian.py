"""Ingest a source straight into an Obsidian vault — no database, no running service.

This reuses the whole pipeline (fetch -> segment -> enrich) and swaps the Postgres writer for
the Obsidian vault writer, so you can use the importer on its own for Obsidian.

Usage:
  uv run python -m app.scripts.to_obsidian url https://google.github.io/adk-docs/ --vault ~/Vault
  uv run python -m app.scripts.to_obsidian article https://example.com/post --vault ~/Vault
  uv run python -m app.scripts.to_obsidian md ./notes.md --vault ~/Vault
  uv run python -m app.scripts.to_obsidian pdf ./book.pdf --vault ~/Vault --collection "My Book"

Each import becomes a folder inside the vault (named after the collection), one note per entry,
with [[wikilinks]] for the relations so Obsidian's graph view and backlinks light up.
"""

from __future__ import annotations

import argparse

from app.pipeline.obsidian import write_vault
from app.pipeline.build import build_import
from app.pipeline.sources import article, markdown, pdf, website
from app.pipeline.sources.base import SourceResult


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
    parser = argparse.ArgumentParser(description="Import a source into an Obsidian vault.")
    parser.add_argument("kind", choices=["url", "article", "md", "pdf"])
    parser.add_argument("target", help="URL or file path")
    parser.add_argument("--vault", required=True, help="path to your Obsidian vault folder")
    parser.add_argument("--concept", help="folder/concept name (default: inferred)")
    parser.add_argument(
        "--min-chars", type=int, default=600,
        help="merge sections smaller than this into their page (lower = more, smaller notes)",
    )
    parser.add_argument(
        "--max-level", type=int, default=2,
        help="split into separate notes down to this heading level; deeper headings fold in",
    )
    args = parser.parse_args()

    result = _load(args.kind, args.target)
    mapped = build_import(
        result.doc,
        concept_name=args.concept or result.suggested_concept,
        scope=result.scope,
        min_artifact_chars=args.min_chars,
        max_split_level=args.max_level,
    )
    summary = write_vault(mapped, args.vault)
    removed = f", removed {summary['removed']} stale" if summary["removed"] else ""
    print(f"Wrote {summary['entries']} notes to {summary['folder']}{removed}")


if __name__ == "__main__":
    main()
