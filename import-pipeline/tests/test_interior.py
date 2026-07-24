"""Phase 1: parse -> segment -> enrich -> map, with no database or network."""

from app.mapping import _BREADCRUMB_SEP
from app.models import RelationType, SourceType
from app.parsing.markdown_parser import parse_markdown
from app.pipeline import build_import
from app.slugify import slugify

SAMPLE = """# Google ADK

ADK is an open-source framework for building, evaluating, and deploying reliable AI agents, giving you tools and orchestration in one place.

## Tools

Tools let agents call functions and interact with external systems. ADK ships several built-in tools and makes it simple to register your own functions.

### Function Tools

Wrap any Python function as a tool. ADK introspects the function signature to build the call schema automatically for the model to use at runtime.

### Built-in Tools

ADK includes search and code-execution tools out of the box. For custom ones, see [Function Tools](#function-tools) elsewhere in the guide content.

## Sessions

Short note.
"""


def _doc():
    return parse_markdown(SAMPLE, fallback_title="Fallback", source_type=SourceType.DOCS)


def _entry(mapped, title):
    return next(e for e in mapped.entries if e.title == title)


def test_markdown_promotes_single_h1_to_root():
    doc = _doc()
    assert doc.meta.title == "Google ADK"
    assert doc.root.title == "Google ADK"
    assert doc.root.content_md.startswith("ADK is an open-source framework")
    assert [c.title for c in doc.root.children] == ["Tools", "Sessions"]


def test_segmentation_granularity_and_merge():
    # At the H3 split level, subsections stay as their own entries.
    mapped = build_import(
        _doc(), collection_name="Google ADK", scope="adk", min_entry_chars=100, max_split_level=3
    )
    titles = {e.title for e in mapped.entries}
    assert titles == {"Google ADK", "Tools", "Function Tools", "Built-in Tools"}
    # ...and the short "Sessions" leaf merged up into the root entry instead of becoming one.
    assert "Sessions" not in titles
    root = _entry(mapped, "Google ADK")
    assert "Short note." in (root.body or "")


def test_default_split_level_folds_subsections_into_pages():
    # The default (H2) folds H3 subsections into their section body — one substantial entry,
    # not a stub plus a swarm of one-paragraph children.
    mapped = build_import(_doc(), collection_name="Google ADK", scope="adk", min_entry_chars=100)
    titles = {e.title for e in mapped.entries}
    assert titles == {"Google ADK", "Tools"}
    tools = _entry(mapped, "Tools")
    assert "### Function Tools" in (tools.body or "")
    assert "### Built-in Tools" in (tools.body or "")


def test_part_of_and_see_also_relations():
    mapped = build_import(
        _doc(), collection_name="Google ADK", scope="adk", min_entry_chars=100, max_split_level=3
    )
    part_of = [r for r in mapped.relations if r.relation_type == RelationType.PART_OF]
    see_also = [r for r in mapped.relations if r.relation_type == RelationType.SEE_ALSO]

    part_of_pairs = {(r.from_key, r.to_key) for r in part_of}
    tools = _entry(mapped, "Tools").source_key
    root = _entry(mapped, "Google ADK").source_key
    fn_tools = _entry(mapped, "Function Tools").source_key
    builtin = _entry(mapped, "Built-in Tools").source_key

    assert (tools, root) in part_of_pairs
    assert (fn_tools, tools) in part_of_pairs
    assert (builtin, tools) in part_of_pairs
    # The internal link Built-in Tools -> #function-tools resolves to a SEE_ALSO (both directions).
    see_also_pairs = {(r.from_key, r.to_key) for r in see_also}
    assert (builtin, fn_tools) in see_also_pairs
    assert (fn_tools, builtin) in see_also_pairs


def test_deterministic_summary_and_tags():
    mapped = build_import(_doc(), collection_name="Google ADK", scope="adk", min_entry_chars=100)
    root = _entry(mapped, "Google ADK")
    assert root.summary is not None
    assert root.summary.startswith("ADK is an open-source framework")
    assert "docs" in root.tags  # structural tag from source type
    assert slugify(root.title) not in root.tags  # title isn't echoed as a tag


def test_metadata_carries_source_key_and_breadcrumb():
    mapped = build_import(
        _doc(), collection_name="Google ADK", scope="adk", min_entry_chars=100, max_split_level=3
    )
    fn_tools = _entry(mapped, "Function Tools")
    assert fn_tools.metadata["sourceKey"] == fn_tools.source_key
    assert fn_tools.metadata["breadcrumb"] == _BREADCRUMB_SEP.join(
        ["Google ADK", "Tools", "Function Tools"]
    )


def test_source_keys_are_stable_across_runs():
    a = build_import(_doc(), collection_name="X", scope="adk", min_entry_chars=100)
    b = build_import(_doc(), collection_name="X", scope="adk", min_entry_chars=100)
    assert [e.source_key for e in a.entries] == [e.source_key for e in b.entries]


DEEP = """# Guide

Intro paragraph long enough to be a real body for the root entry of this guide.

## Setup

Setup section content that is substantial enough to stand as its own readable entry here.

#### Env vars

A deep H4 heading whose content should fold into Setup, not spawn its own tiny entry node.

## Hub

### Only child

The only child body, long enough on its own to remain a standalone entry under the hub.
"""


def _deep():
    return parse_markdown(DEEP, fallback_title="Fallback", source_type=SourceType.DOCS)


def test_deep_headings_fold_into_ancestor_entry():
    mapped = build_import(_deep(), collection_name="G", scope="g", min_entry_chars=80, max_split_level=3)
    titles = {e.title for e in mapped.entries}
    assert "Env vars" not in titles  # H4 folded up
    setup = _entry(mapped, "Setup")
    assert "#### Env vars" in (setup.body or "")  # folded with its heading preserved
    assert "fold into Setup" in (setup.body or "")


def test_empty_hub_gets_toc_body_and_no_blank_entries():
    mapped = build_import(_deep(), collection_name="G", scope="g", min_entry_chars=80, max_split_level=3)
    for entry in mapped.entries:
        assert (entry.body or "").strip(), f"{entry.title} is blank"
    hub = _entry(mapped, "Hub")  # has only content via its child -> ToC body
    assert "- Only child" in (hub.body or "")


def test_tags_have_no_trailing_punctuation():
    mapped = build_import(_doc(), collection_name="Google ADK", scope="adk", min_entry_chars=100)
    for entry in mapped.entries:
        for tag in entry.tags:
            assert tag == tag.strip(" .,:;"), f"noisy tag {tag!r}"
            assert not tag.endswith("."), f"trailing dot in tag {tag!r}"
