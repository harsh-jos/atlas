"""[6] Writer: persist a MappedImport into Postgres in one transaction, with batched writes.

A large import is a handful of statements: one lookup of existing entries, one slug load, then
bulk insert/update of entries, bulk source replace, and a bulk relation insert. Entries are
written first so relations can be resolved from sourceKey -> id. The whole thing is atomic — a
failure leaves the database untouched (fail loud, never a half-written import).
"""

from __future__ import annotations

from typing import TypedDict
from uuid import uuid4

from psycopg import Connection

from app.db import repository as repo
from app.models import MappedImport


class ImportSummary(TypedDict):
    collectionSlug: str
    entries: int
    relations: int


def write_import(conn: Connection, mapped: MappedImport) -> ImportSummary:
    with conn.transaction():
        collection = repo.ensure_collection(
            conn,
            mapped.collection.name,
            description=mapped.collection.description,
            color=mapped.collection.color,
        )
        collection_id = collection["id"]

        existing = repo.find_entries_by_source_keys(
            conn, collection_id, [e.source_key for e in mapped.entries]
        )
        taken_slugs = repo.load_existing_slugs(conn)

        new_specs = [e for e in mapped.entries if e.source_key not in existing]
        update_specs = [e for e in mapped.entries if e.source_key in existing]
        new_slugs = repo.allocate_slugs((e.title for e in new_specs), taken_slugs)

        key_to_id: dict[str, str] = {}

        insert_rows = []
        for spec, slug in zip(new_specs, new_slugs, strict=True):
            entry_id = str(uuid4())
            key_to_id[spec.source_key] = entry_id
            insert_rows.append(
                {
                    "id": entry_id,
                    "title": spec.title,
                    "slug": slug,
                    "summary": spec.summary,
                    "body": spec.body,
                    "tags": spec.tags,
                    "collection_id": collection_id,
                    "metadata": spec.metadata,
                }
            )
        repo.insert_entries(conn, insert_rows)

        update_rows = []
        for spec in update_specs:
            entry_id = existing[spec.source_key]["id"]
            key_to_id[spec.source_key] = entry_id
            update_rows.append(
                {
                    "id": entry_id,
                    "title": spec.title,
                    "summary": spec.summary,
                    "body": spec.body,
                    "tags": spec.tags,
                    "metadata": spec.metadata,
                }
            )
        repo.update_entries(conn, update_rows)

        source_rows = [
            {"entry_id": key_to_id[spec.source_key], **spec.source}
            for spec in mapped.entries
            if spec.source
        ]
        repo.replace_sources(conn, list(key_to_id.values()), source_rows)

        relation_rows = []
        for relation in mapped.relations:
            from_id = key_to_id.get(relation.from_key)
            to_id = key_to_id.get(relation.to_key)
            if from_id and to_id and from_id != to_id:
                relation_rows.append(
                    {
                        "fromId": from_id,
                        "toId": to_id,
                        "relationType": str(relation.relation_type),
                        "note": relation.note,
                    }
                )
        relations = repo.insert_relations(conn, relation_rows)

    return {
        "collectionSlug": collection["slug"],
        "entries": len(mapped.entries),
        "relations": relations,
    }
