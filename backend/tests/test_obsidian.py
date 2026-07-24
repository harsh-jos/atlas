"""Obsidian vault writer: MappedImport -> linked markdown notes (uses tmp_path, no DB)."""

from app.pipeline.obsidian import _safe_name, write_vault
from app.pipeline.models import SourceType
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.build import build_import

SAMPLE = """# Guide

An overview paragraph long enough to be a real body for the guide's root note here.

## Tools

Tools let agents call functions and interact with external systems in a real way here.

## Sessions

Sessions keep conversational state across turns so an agent can remember the context here.
"""


def _mapped():
    doc = parse_markdown(SAMPLE, fallback_title="Guide", source_type=SourceType.DOCS)
    return build_import(doc, collection_name="My Guide", scope="guide", min_entry_chars=40)


def test_writes_one_note_per_entry_in_a_collection_folder(tmp_path):
    summary = write_vault(_mapped(), tmp_path)
    folder = tmp_path / "My Guide"
    assert folder.is_dir()
    notes = {p.stem for p in folder.glob("*.md")}
    assert {"Guide", "Tools", "Sessions"} <= notes
    assert summary["entries"] == len(list(folder.glob("*.md")))


def test_notes_have_frontmatter_and_wikilinks(tmp_path):
    write_vault(_mapped(), tmp_path)
    tools = (tmp_path / "My Guide" / "Tools.md").read_text()
    assert tools.startswith("---\n")
    assert 'title: "Tools"' in tools
    assert "tags:" in tools
    assert "## Related" in tools
    assert "[[Guide]]" in tools  # PART_OF -> wikilink to the parent note


def test_reimport_prunes_stale_notes(tmp_path):
    write_vault(_mapped(), tmp_path)
    folder = tmp_path / "My Guide"
    (folder / "Orphan.md").write_text("stale note from an earlier run")
    summary = write_vault(_mapped(), tmp_path)
    assert summary["removed"] == 1
    assert not (folder / "Orphan.md").exists()


def test_safe_name_strips_wikilink_hostile_chars():
    assert _safe_name("A/B: C? [x]") == "A B C x"
    assert _safe_name("///") == "untitled"
