"""End-to-end check of the interior + writer against the real database, self-cleaning.

Builds a MappedImport from a small markdown doc, writes it, re-writes it to prove idempotency,
verifies row counts, then deletes everything it created.

Run: `uv run python -m app.scripts.smoke_pipeline`
"""

from app.db.pool import close_pool, get_pool
from app.models import SourceType
from app.parsing.markdown_parser import parse_markdown
from app.pipeline import build_import
from app.writer import write_import

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
        doc, collection_name="Pipeline Smoke", scope="pipeline-smoke", min_entry_chars=40
    )
    print(f"built: {len(mapped.entries)} entries, {len(mapped.relations)} relations")

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
                    (first["collectionSlug"],),
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
                    (first["collectionSlug"],),
                )
                conn.execute('DELETE FROM "Collection" WHERE slug = %s', (first["collectionSlug"],))
    finally:
        close_pool()

    print("smoke_pipeline ok — full path wrote, re-imported idempotently, cleaned up")


if __name__ == "__main__":
    main()
