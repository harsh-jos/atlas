"""Write a MappedImport into an Obsidian vault as linked markdown notes.

An alternative sink to the Postgres writer (`app/writer.py`): the same parsed, segmented and
enriched import, emitted as one `.md` file per entry with YAML frontmatter and `[[wikilinks]]`
for relations — so the result works in Obsidian (graph view, backlinks) with no database.

Idempotent per folder: a re-import overwrites the same note files and removes notes whose
section disappeared, so the vault folder mirrors the source.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TypedDict

from app.pipeline.models import EntrySpec, MappedImport, RelationType

_ILLEGAL = re.compile(r'[\\/:*?"<>|\[\]#^]+')  # filename- and wikilink-hostile characters
_WS = re.compile(r"\s+")

_REL_LABEL: dict[RelationType, str] = {
    RelationType.PART_OF: "Part of",
    RelationType.SEE_ALSO: "See also",
    RelationType.USES: "Uses",
    RelationType.PREREQUISITE: "Prerequisite",
    RelationType.CONTRASTS: "Contrasts with",
}


class ObsidianSummary(TypedDict):
    folder: str
    entries: int
    removed: int


def _safe_name(title: str) -> str:
    return _WS.sub(" ", _ILLEGAL.sub(" ", title)).strip(" .") or "untitled"


def _note_names(mapped: MappedImport) -> dict[str, str]:
    """Assign a unique, filesystem-safe note name per entry (source_key -> name)."""
    used: set[str] = set()
    names: dict[str, str] = {}
    for entry in mapped.entries:
        base = _safe_name(entry.title)
        name, suffix = base, 1
        while name.lower() in used:
            suffix += 1
            name = f"{base} {suffix}"
        used.add(name.lower())
        names[entry.source_key] = name
    return names


def _wikilink(name: str, title: str) -> str:
    # Show the clean title even when the file name was disambiguated ("Foo 2").
    return f"[[{name}|{title}]]" if name != title else f"[[{name}]]"


def _frontmatter(entry: EntrySpec) -> str:
    lines = ["---", f'title: "{entry.title.replace(chr(34), chr(39))}"']
    if entry.tags:
        lines.append("tags:")
        lines.extend(f"  - {tag}" for tag in entry.tags)
    source_url = entry.metadata.get("sourceUrl")
    if source_url:
        lines.append(f"source: {source_url}")
    breadcrumb = entry.metadata.get("breadcrumb")
    if breadcrumb:
        lines.append(f'breadcrumb: "{breadcrumb}"')
    lines.append("---")
    return "\n".join(lines)


def _related(
    source_key: str, names: dict[str, str], titles: dict[str, str], mapped: MappedImport
) -> str:
    grouped: dict[RelationType, list[str]] = {}
    for relation in mapped.relations:
        if relation.from_key == source_key and relation.to_key in names:
            grouped.setdefault(relation.relation_type, []).append(relation.to_key)
    if not grouped:
        return ""

    lines = ["## Related"]
    for rtype, targets in grouped.items():
        label = _REL_LABEL.get(rtype, rtype.value)
        for key in dict.fromkeys(targets):  # dedupe, keep order
            lines.append(f"- {label} {_wikilink(names[key], titles[key])}")
    return "\n".join(lines)


def _render(entry: EntrySpec, names: dict[str, str], titles: dict[str, str], mapped: MappedImport) -> str:
    parts = [_frontmatter(entry)]
    if entry.summary:
        parts.append(f"> [!abstract]\n> {entry.summary}")
    if entry.body:
        parts.append(entry.body)
    related = _related(entry.source_key, names, titles, mapped)
    if related:
        parts.append(related)
    return "\n\n".join(parts).strip() + "\n"


def write_vault(mapped: MappedImport, vault_dir: str | Path) -> ObsidianSummary:
    folder = Path(vault_dir).expanduser() / _safe_name(mapped.collection.name)
    folder.mkdir(parents=True, exist_ok=True)

    names = _note_names(mapped)
    titles = {entry.source_key: entry.title for entry in mapped.entries}

    written: set[str] = set()
    for entry in mapped.entries:
        filename = f"{names[entry.source_key]}.md"
        (folder / filename).write_text(_render(entry, names, titles, mapped), encoding="utf-8")
        written.add(filename)

    # Idempotency: drop notes from a prior run whose section is gone this time.
    removed = 0
    for existing in folder.glob("*.md"):
        if existing.name not in written:
            existing.unlink()
            removed += 1

    return {"folder": str(folder), "entries": len(mapped.entries), "removed": removed}
