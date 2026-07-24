"""Phase 2: hermetic tests for source-adapter helpers (no network, no docling)."""

from app.pipeline.models import SourceType
from app.pipeline.sources import crawl, markdown, website

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
    assert result.suggested_concept == "Title"  # promoted H1 wins over the fallback
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


def test_prefixes_probe_subpath_then_root():
    # A docs site on a subpath must be probed at the path prefix *and* the domain root,
    # most-specific first — this is the fix for subpath-hosted docs (google.github.io/adk-docs/).
    assert website._prefixes("https://google.github.io/adk-docs/get-started/") == [
        "https://google.github.io/adk-docs/get-started/",
        "https://google.github.io/adk-docs/",
        "https://google.github.io/",
    ]
    # A trailing file segment is dropped so we probe its directory.
    assert website._prefixes("https://x.io/docs/intro.html") == [
        "https://x.io/docs/",
        "https://x.io/",
    ]
    assert website._prefixes("https://x.io/") == ["https://x.io/"]


def test_doc_title_reads_first_heading():
    assert website._doc_title("# Agent Development Kit\n\n> intro", "host") == "Agent Development Kit"
    assert website._doc_title("no heading here", "fallback") == "fallback"


def test_crawler_keeps_same_prefix_html_links_only():
    prefix = "https://x.io/docs/"
    html = """
      <a href="/docs/a">in</a>
      <a href="/docs/b.html">also in</a>
      <a href="/other/c">out of prefix</a>
      <a href="/docs/file.pdf">asset</a>
      <a href="https://ext.com/docs/d">off site</a>
      <a href="/docs/a#frag">dup via fragment</a>
    """
    links = crawl._links(html, "https://x.io/docs/index.html", prefix)
    assert links == ["https://x.io/docs/a", "https://x.io/docs/b.html", "https://x.io/docs/a"]


def test_crawler_normalize_strips_fragment_and_index():
    assert crawl._normalize("https://x.io/docs/a/index.html#top") == "https://x.io/docs/a/"
    assert crawl._normalize("https://x.io/docs/a#x") == "https://x.io/docs/a"
