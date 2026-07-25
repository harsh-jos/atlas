"""End-to-end check of the interior + writer against the real database, self-cleaning.

Builds a MappedImport from a small markdown doc, writes it, re-writes it to prove idempotency,
verifies row counts, then deletes everything it created.

Run: `uv run python -m app.scripts.smoke_pipeline`
"""

from app.pipeline.db.pool import close_pool, get_pool
from app.pipeline.models import SourceType
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.build import build_import
from app.pipeline.writer import write_import

SAMPLE = """# Smoke Pipeline Doc

A tiny document used to validate the full import path end to end against Postgres.

## Section One

Section one has enough prose to stand on its own as a separate entry in the graph and reader.

## Section Two

Section two also carries its own body so it becomes a distinct subsection entry, linked by PART_OF.
"""


def main() -> None:
    doc = parse_markdown(SAMPLE, fallback_title="Smoke", source_type=SourceType.DOCS)
    mapped = build_import(
        doc, concept_name="Pipeline Smoke", scope="pipeline-smoke", min_artifact_chars=40
    )
    print(f"built: {len(mapped.artifacts)} entries, {len(mapped.relations)} relations")

    pool = get_pool()
    try:
        with pool.connection() as conn:
            first = write_import(conn, mapped)
            print(f"write 1: {first}")
            second = write_import(conn, mapped)
            print(f"write 2 (re-import): {second}")

            with conn.cursor() as cur:
                cur.execute(
                    'SELECT count(*) AS n FROM "Entry" e '
                    'JOIN "Collection" c ON c.id = e."collectionId" WHERE c.slug = %s',
                    (first["conceptSlug"],),
                )
                row = cur.fetchone()
                count = row["n"] if row else 0
            print(f"entries in collection after re-import: {count}")
            assert count == first["entries"], "re-import must not duplicate entries"

            # Clean up.
            with conn.transaction():
                conn.execute(
                    'DELETE FROM "Entry" WHERE "collectionId" = '
                    '(SELECT id FROM "Collection" WHERE slug = %s)',
                    (first["conceptSlug"],),
                )
                conn.execute('DELETE FROM "Collection" WHERE slug = %s', (first["conceptSlug"],))
    finally:
        close_pool()

    print("smoke_pipeline ok — full path wrote, re-imported idempotently, cleaned up")


if __name__ == "__main__":
    main()
