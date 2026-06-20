"""Thin raw-SQL data-access layer over the Prisma-owned Atlas schema.

prisma-client-py was archived in 2025, so there is no shared client. Prisma (the Next.js
side) remains the single source of truth for the schema and migrations; this module only
writes rows. Two schema realities are honored here (from the init migration):

  * `id` has no DB default  -> we generate a UUID string.
  * `updatedAt` has no default -> we set it explicitly with now(); `createdAt` defaults.

Writes are batched (executemany) so a large import is a handful of statements, not thousands
of round-trips. Idempotency is keyed on (collectionId, metadata->>'sourceKey'), not slug, so
re-imports update entries in place while keeping human-readable slugs.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any, TypedDict
from uuid import uuid4

from psycopg import Connection
from psycopg.types.json import Json

from app.slugify import slugify


class WriteResult(TypedDict):
    id: str
    slug: str


def _new_id() -> str:
    return str(uuid4())


def ensure_indexes(conn: Connection) -> None:
    """Index supporting the idempotent re-import lookup (collectionId + metadata sourceKey).

    Created out-of-band, IF NOT EXISTS — the same pattern the app's seed uses for its GIN
    index on tags. Not in schema.prisma, so `prisma migrate` is unaffected.
    """
    conn.execute(
        'CREATE INDEX IF NOT EXISTS entry_collection_source_key_idx '
        "ON \"Entry\" (\"collectionId\", ((metadata->>'sourceKey')))"
    )


def ensure_collection(
    conn: Connection,
    name: str,
    *,
    description: str | None = None,
    color: str | None = None,
) -> WriteResult:
    """Insert the collection (by slug) or return the existing one, refreshing metadata."""
    row = conn.execute(
        """
        INSERT INTO "Collection" (id, name, slug, description, color, "updatedAt")
        VALUES (%(id)s, %(name)s, %(slug)s, %(description)s, %(color)s, now())
        ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            description = COALESCE(EXCLUDED.description, "Collection".description),
            color = COALESCE(EXCLUDED.color, "Collection".color),
            "updatedAt" = now()
        RETURNING id, slug
        """,
        {
            "id": _new_id(),
            "name": name,
            "slug": slugify(name) or "untitled",
            "description": description,
            "color": color,
        },
    ).fetchone()
    assert row is not None
    return row  # type: ignore[return-value]


def find_entries_by_source_keys(
    conn: Connection, collection_id: str, source_keys: Sequence[str]
) -> dict[str, WriteResult]:
    """Map sourceKey -> existing {id, slug} for this collection, in one query."""
    if not source_keys:
        return {}
    rows = conn.execute(
        """
        SELECT id, slug, metadata->>'sourceKey' AS sk
        FROM "Entry"
        WHERE "collectionId" = %s AND metadata->>'sourceKey' = ANY(%s::text[])
        """,
        (collection_id, list(source_keys)),
    ).fetchall()
    return {row["sk"]: {"id": row["id"], "slug": row["slug"]} for row in rows}


def load_existing_slugs(conn: Connection) -> set[str]:
    """All entry slugs (slug is globally unique) — used to allocate slugs without per-row queries."""
    return {row["slug"] for row in conn.execute('SELECT slug FROM "Entry"').fetchall()}


def allocate_slugs(titles: Iterable[str], taken: set[str]) -> list[str]:
    """Assign a unique slug per title against `taken`, mirroring lib/entry-slugs.ts suffixing.
    Mutates `taken` so slugs are unique within the batch too."""
    slugs: list[str] = []
    for title in titles:
        base = slugify(title) or "untitled"
        slug = base
        suffix = 1
        while slug in taken:
            slug = f"{base}-{suffix}"
            suffix += 1
        taken.add(slug)
        slugs.append(slug)
    return slugs


def insert_entries(conn: Connection, entries: Sequence[dict[str, Any]]) -> None:
    if not entries:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO "Entry"
                (id, title, slug, summary, body, tags, "collectionId", metadata, "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s::text[], %s, %s, now())
            """,
            [
                (
                    e["id"],
                    e["title"],
                    e["slug"],
                    e["summary"],
                    e["body"],
                    e["tags"],
                    e["collection_id"],
                    Json(e["metadata"]),
                )
                for e in entries
            ],
        )


def update_entries(conn: Connection, entries: Sequence[dict[str, Any]]) -> None:
    if not entries:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE "Entry" SET
                title = %s, summary = %s, body = %s, tags = %s::text[],
                metadata = %s, "updatedAt" = now()
            WHERE id = %s
            """,
            [
                (e["title"], e["summary"], e["body"], e["tags"], Json(e["metadata"]), e["id"])
                for e in entries
            ],
        )


def replace_sources(
    conn: Connection, entry_ids: Sequence[str], sources: Sequence[dict[str, Any]]
) -> None:
    """Clear and re-insert provenance for the given entries (delete-then-insert, in bulk)."""
    if entry_ids:
        conn.execute('DELETE FROM "Source" WHERE "entryId" = ANY(%s::text[])', (list(entry_ids),))
    if not sources:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO "Source" (id, "entryId", "sourceType", title, author, url, ref)
            VALUES (%s, %s, %s::"SourceType", %s, %s, %s, %s)
            """,
            [
                (
                    _new_id(),
                    s["entry_id"],
                    s["sourceType"],
                    s["title"],
                    s.get("author"),
                    s.get("url"),
                    s.get("ref"),
                )
                for s in sources
            ],
        )


def insert_relations(conn: Connection, relations: Sequence[dict[str, Any]]) -> int:
    """Insert typed edges in bulk, skipping duplicates. Returns the number of edges attempted."""
    if not relations:
        return 0
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO "Relation" (id, "fromId", "toId", "relationType", note)
            VALUES (%s, %s, %s, %s::"RelationType", %s)
            ON CONFLICT ("fromId", "toId", "relationType") DO NOTHING
            """,
            [
                (_new_id(), r["fromId"], r["toId"], r["relationType"], r.get("note"))
                for r in relations
            ],
        )
    return len(relations)
