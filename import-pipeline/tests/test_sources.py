"""Phase 2: hermetic tests for source-adapter helpers (no network, no docling)."""

from app.models import SourceType
from app.sources import markdown, website

URLSET = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://docs.example.com/a</loc></url>
  <url><loc>https://docs.example.com/b</loc></url>
  <url><loc>https://other.example.com/c</loc></url>
</urlset>"""


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
    locs = website._locs(URLSET)
    assert locs == [
        "https://docs.example.com/a",
        "https://docs.example.com/b",
        "https://other.example.com/c",
    ]


def test_looks_like_markdown_rejects_html():
    assert website._looks_like_markdown("# Heading\n\ntext")
    assert not website._looks_like_markdown("<!DOCTYPE html><html>...")


def test_base_and_host_normalization():
    assert website._base("https://adk.dev/get-started/") == "https://adk.dev/"
    assert website._host("https://adk.dev/x") == "adk.dev"
    assert website._base("adk.dev") == "https://adk.dev/"
