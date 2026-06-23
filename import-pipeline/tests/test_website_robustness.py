"""Regression tests for the three baseline website-adapter bugs (H1/H2/H3).

Each asserts the *corrected* behavior; the baseline pipeline got every one of these wrong and
silently degraded a whole docs site to 1–3 entries. Hermetic — no network.
"""

from app.parsing.markdown_detect import is_markdown_document, strip_llm_preamble
from app.sources import locations

# --- H1: llms-full.txt that opens with a <SYSTEM> instruction block --------------------------

HONO_HEAD = (
    "<SYSTEM>This is the full developer documentation for Hono.</SYSTEM>\n\n"
    "# Start of Hono documentation\n\n# Hono\n\nHono is a small, simple, ultrafast web framework."
)


def test_system_prefixed_llms_txt_is_recognized_as_markdown():
    # Baseline bug: leading '<' -> rejected as HTML -> 358KB source discarded, homepage scraped.
    assert is_markdown_document(HONO_HEAD)


def test_strip_llm_preamble_removes_system_block_only():
    stripped = strip_llm_preamble(HONO_HEAD)
    assert stripped.lstrip().startswith("# Start of Hono documentation")
    assert "<SYSTEM>" not in stripped


def test_real_html_page_still_rejected():
    assert not is_markdown_document("<!doctype html><html><body>Not found</body></html>")


# --- H2: docs hosted under a path prefix (docs.astral.sh/uv/) --------------------------------


def test_llms_candidates_try_subpath_before_domain_root():
    candidates = locations.llms_candidates("https://docs.astral.sh/uv/")
    # The real file lives at .../uv/llms.txt; the baseline only ever probed the domain root.
    assert "https://docs.astral.sh/uv/llms-full.txt" in candidates
    assert "https://docs.astral.sh/uv/llms.txt" in candidates
    assert candidates.index("https://docs.astral.sh/uv/llms.txt") < candidates.index(
        "https://docs.astral.sh/llms.txt"
    )


def test_sitemap_candidates_include_subpath():
    candidates = locations.sitemap_candidates("https://docs.astral.sh/uv/")
    assert candidates[0] == "https://docs.astral.sh/uv/sitemap.xml"
    assert "https://docs.astral.sh/sitemap.xml" in candidates


# --- H3: sitemap whose <loc>s are on a canonical sibling host --------------------------------


def test_select_pages_keeps_www_and_apex_together():
    locs = ["https://www.example.com/a", "https://example.com/b"]
    kept, dropped = locations.select_pages(locs, served_from="https://example.com/sitemap.xml")
    assert kept == locs and dropped == 0


def test_select_pages_adopts_single_canonical_foreign_host():
    # www.starlette.io's sitemap lists starlette.dev URLs (different TLD) — authoritative, adopt.
    locs = ["https://starlette.dev/", "https://starlette.dev/requests/"]
    kept, dropped = locations.select_pages(locs, served_from="https://www.starlette.io/sitemap.xml")
    assert kept == locs and dropped == 0


def test_select_pages_drops_genuinely_mixed_external_hosts():
    locs = ["https://example.com/a", "https://tracker.test/x", "https://ads.test/y"]
    kept, dropped = locations.select_pages(locs, served_from="https://example.com/sitemap.xml")
    assert kept == ["https://example.com/a"] and dropped == 2
