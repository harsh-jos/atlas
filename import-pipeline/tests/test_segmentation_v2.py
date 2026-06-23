"""Phase 2: segmentation hygiene (oversize split, structural parents) and cross-page SEE_ALSO."""

from app.models import DocMeta, RelationType, Section, SourceType, StructuredDocument
from app.parsing.markdown_parser import parse_markdown
from app.pipeline import build_import


def _entry(mapped, title):
    return next(e for e in mapped.entries if e.title == title)


def _pairs(mapped, kind):
    return {(r.from_key, r.to_key) for r in mapped.relations if r.relation_type == kind}


# --- M1: oversized bodies split into PART_OF continuations -----------------------------------


def test_oversized_body_splits_into_part_of_continuations():
    paragraphs = "\n\n".join(
        f"Paragraph {i} carries enough words to take a real bite out of the size budget here."
        for i in range(10)
    )
    md = f"# Doc\n\nA lead paragraph long enough to be the root entry's own body text.\n\n## Big\n\n{paragraphs}\n"
    mapped = build_import(
        parse_markdown(md, fallback_title="Doc", source_type=SourceType.DOCS),
        collection_name="X", scope="x", min_entry_chars=10, max_entry_chars=200,
    )

    first = _entry(mapped, "Big")
    parts = [e for e in mapped.entries if e.title.startswith("Big (part ")]
    assert parts, "an oversized section should produce continuation parts"
    assert len(first.body or "") <= 200
    part_of = _pairs(mapped, RelationType.PART_OF)
    for part in parts:
        assert len(part.body or "") <= 200
        assert (part.source_key, first.source_key) in part_of  # continuation is PART_OF the first


def test_oversized_list_block_splits_on_line_boundaries():
    # A long list/reference block has no blank lines, so paragraph splitting can't divide it;
    # fall back to line boundaries (e.g. a Wikipedia references section).
    items = "\n".join(f"- item {i} with a little descriptive text to add some length" for i in range(40))
    md = f"# Doc\n\nA lead paragraph long enough to be the root entry's own body text.\n\n## List\n\n{items}\n"
    mapped = build_import(
        parse_markdown(md, fallback_title="Doc", source_type=SourceType.DOCS),
        collection_name="X", scope="x", min_entry_chars=10, max_entry_chars=300,
    )
    parts = [e for e in mapped.entries if e.title.startswith("List (part ")]
    assert parts, "an oversized single-block list should split on line boundaries"
    assert all(len(e.body or "") <= 300 for e in parts)


def test_structural_flag_clears_when_parent_absorbs_a_short_child():
    md = (
        "# Doc\n\nA real lead paragraph giving the root entry a body of its own to show.\n\n"
        "## Parent\n\n### Tiny\n\nshort.\n"
    )
    mapped = build_import(
        parse_markdown(md, fallback_title="Doc", source_type=SourceType.DOCS),
        collection_name="X", scope="x", min_entry_chars=200,
    )
    parent = _entry(mapped, "Parent")
    assert "structural" not in parent.metadata  # it absorbed Tiny, so it's no longer just an anchor
    assert "short" in (parent.body or "")


def test_indivisible_oversized_block_is_left_whole():
    # A single huge paragraph (no blank lines) can't be split without mangling it — keep it whole.
    giant = "word " * 200  # ~1000 chars, one paragraph
    md = f"# Doc\n\nlead body text that is comfortably long enough to stand alone here.\n\n## Mono\n\n{giant}\n"
    mapped = build_import(
        parse_markdown(md, fallback_title="Doc", source_type=SourceType.DOCS),
        collection_name="X", scope="x", min_entry_chars=10, max_entry_chars=200,
    )
    assert not [e for e in mapped.entries if e.title.startswith("Mono (part ")]


# --- M1: heading-only parents are kept but flagged structural --------------------------------


def test_empty_parent_is_flagged_structural():
    md = (
        "# Doc\n\nA real lead paragraph giving the root entry a body of its own to show.\n\n"
        "## Container\n\n### Child\n\nThe child holds the real prose that stands as its own entry.\n"
    )
    mapped = build_import(
        parse_markdown(md, fallback_title="Doc", source_type=SourceType.DOCS),
        collection_name="X", scope="x", min_entry_chars=10,
    )
    container = _entry(mapped, "Container")
    assert container.metadata.get("structural") is True
    assert container.body is None  # no fabricated body
    child = _entry(mapped, "Child")
    assert "structural" not in child.metadata


# --- M2: cross-page links become SEE_ALSO, with per-page provenance --------------------------


def _two_page_site() -> StructuredDocument:
    page_a = Section(
        title="Applications", level=1, anchor="applications",
        source_url="https://site.dev/applications/",
        content_md="An application wires routes together; see the requests page for input handling.",
        links=["https://site.dev/requests/"],
    )
    page_b = Section(
        title="Requests", level=1, anchor="requests",
        source_url="https://site.dev/requests/",
        content_md="A request gives typed access to the incoming data for your endpoint to use.",
    )
    root = Section(title="site.dev", level=0, children=[page_a, page_b])
    meta = DocMeta(title="site.dev", source_type=SourceType.DOCS, source_url="https://site.dev/")
    return StructuredDocument(meta=meta, root=root)


def test_cross_page_link_resolves_to_bidirectional_see_also():
    mapped = build_import(_two_page_site(), collection_name="Site", scope="site.dev",
                          min_entry_chars=10)
    see_also = _pairs(mapped, RelationType.SEE_ALSO)
    a = _entry(mapped, "Applications").source_key
    b = _entry(mapped, "Requests").source_key
    assert (a, b) in see_also and (b, a) in see_also


def test_each_entry_carries_its_own_page_url():
    mapped = build_import(_two_page_site(), collection_name="Site", scope="site.dev",
                          min_entry_chars=10)
    apps = _entry(mapped, "Applications")
    assert apps.metadata["sourceUrl"].startswith("https://site.dev/applications/")
    assert apps.source is not None
    assert str(apps.source["url"]).startswith("https://site.dev/applications/")
