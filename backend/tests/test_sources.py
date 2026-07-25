"""Phase 2: hermetic tests for source-adapter helpers (no network, no docling)."""

from app.pipeline.sources.article import extract_markdown
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
    assert (
        website._doc_title("# Agent Development Kit\n\n> intro", "host") == "Agent Development Kit"
    )
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


class TestHeadingRecovery:
    """Headings are what the segmenter splits on; losing them collapses a page to one artifact."""

    CONTENT = (
        "<h1>Retrieval Notes</h1><p>Overview of how retrieval works and what each method trades "
        "away to get there, across both lexical and dense approaches to the problem.</p>"
        "<h2>BM25</h2><p>BM25 descends from the probabilistic relevance framework and saturates "
        "term frequency, so a word repeated fifty times does not score fifty times higher.</p>"
        "<h2>Dense embeddings</h2><p>A dense retriever maps passages into a vector space where "
        "proximity approximates semantic relatedness, matching text sharing no vocabulary.</p>"
        "<h2>HNSW</h2><p>Hierarchical navigable small worlds builds a layered proximity graph, "
        "searching coarse layers first and descending into finer ones as it narrows down.</p>"
    )

    def _page(self, body: str) -> str:
        return f"<html><head><title>Retrieval Notes</title></head><body>{body}</body></html>"

    def _headings(self, markdown: str | None) -> int:
        return len([line for line in (markdown or "").splitlines() if line.startswith("#")])

    def test_semantic_markup_keeps_its_headings(self):
        html = self._page(f"<article>{self.CONTENT}</article>")
        assert self._headings(extract_markdown(html, "https://example.com/a")) >= 4

    def test_a_bare_page_recovers_its_headings(self):
        """Without <article>, the precise pass flattens the page; the retry rescues it."""
        html = self._page(self.CONTENT)
        assert self._headings(extract_markdown(html, "https://example.com/b")) >= 4

    def test_a_page_with_no_headings_is_left_alone(self):
        html = self._page("<p>" + "One long unbroken paragraph of prose. " * 12 + "</p>")
        markdown = extract_markdown(html, "https://example.com/c")
        assert markdown and self._headings(markdown) == 0

    def test_unrecoverable_flattening_is_reported(self, caplog):
        """Nav and footer noise defeats the retry, so it must warn rather than fail silently."""
        html = self._page(
            "<nav><a href='/'>Home</a><a href='/d'>Docs</a></nav>"
            f"{self.CONTENT}"
            "<aside>Subscribe for weekly updates and product news from our team.</aside>"
            "<footer>Copyright 2026 Example Inc. All rights reserved. Privacy. Terms.</footer>"
        )
        with caplog.at_level("WARNING"):
            markdown = extract_markdown(html, "https://example.com/d")

        if self._headings(markdown) == 0:
            assert "flattened" in caplog.text
