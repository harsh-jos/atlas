"""Phase 2: hermetic tests for source-adapter helpers (no network, no docling)."""

from app.models import SourceType
from app.sources import locations, markdown, strategies


def test_markdown_adapter_builds_source_result():
    result = markdown.from_markdown_text(
        "# Title\n\nA body paragraph that is reasonably long so it survives as content.",
        title="Notes",
        source_type=SourceType.DOCS,
    )
    assert result.suggested_collection == "Title"  # promoted H1 wins over the fallback
    assert result.scope == "md:notes"
    assert result.doc.meta.source_type == SourceType.DOCS


def test_sitemap_locs_parsing_handles_namespaces():
    urlset = b"""<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://docs.example.com/a</loc></url>
      <url><loc>https://docs.example.com/b</loc></url>
      <url><loc>https://other.example.com/c</loc></url>
    </urlset>"""
    is_index, locs = strategies._loc_texts(urlset)
    assert not is_index
    assert locs == [
        "https://docs.example.com/a",
        "https://docs.example.com/b",
        "https://other.example.com/c",
    ]


def test_base_and_host_normalization():
    assert locations.domain_base("https://adk.dev/get-started/") == "https://adk.dev/"
    assert locations.host("https://adk.dev/x") == "adk.dev"
    assert locations.domain_base("adk.dev") == "https://adk.dev/"
