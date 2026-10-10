"""KB pipeline: crawl gates, triage/outline against a fake LLM, and the mapper."""

from app.core.enums import RelationType
from app.kb_pipeline.fetch import (
    Robots, crawl_site, normalize_url, scope_of, should_skip,
)
from app.kb_pipeline.mapper import build_mapped_import
from app.kb_pipeline.models import Page
from app.kb_pipeline.outline import ArticlePlan, OutlinePlan
from app.kb_pipeline.triage import PageVerdict, TriageBatch, TriagedPage, triage_pages


def make_page(i: int) -> Page:
    return Page(
        url=f"https://x.org/docs/p{i}.html", title=f"Page {i}",
        markdown=f"# Page {i}\n\nProse about topic {i}. " * 10,
        fetched_at="2026-08-13T00:00:00+00:00", headings=[f"Page {i}"], word_count=100,
    )


class FakeLLM:
    provider = "fake"
    model = "fake-1"

    def __init__(self, parse_results=None, write_results=None):
        self.parse_results = list(parse_results or [])
        self.write_results = list(write_results or [])
        self.usage = {"input_tokens": 0, "output_tokens": 0, "calls": 0}

    def parse(self, *, system, user, schema, max_tokens=8192):
        return self.parse_results.pop(0)

    def write(self, *, system, user, max_tokens=16384):
        return self.write_results.pop(0)


# --- crawl gates (the atlas-specific regressions) ---------------------------

def test_url_normalization_and_scope():
    assert normalize_url("https://X.org/a/index.html?utm_source=t#x") == "https://x.org/a/"
    assert scope_of("https://x.org/docs/guide/intro.html") == "https://x.org/docs/guide/"


def test_skip_gates():
    assert should_skip("https://x.org/ja/docs/a.html")
    assert should_skip("https://x.org/docs/_sources/a.txt")
    assert not should_skip("https://x.org/docs/tutorial.html")


class FakeFetcher:
    def __init__(self, site: dict, texts: dict | None = None):
        self.site, self.texts, self.fetched = site, texts or {}, []

    def get_html(self, url):
        self.fetched.append(url)
        html = self.site.get(url)
        return (url, html) if html is not None else None

    def get_text(self, url):
        return self.texts.get(url)


def _page_html(links=()):
    body = "".join(f'<a href="{link}">l</a>' for link in links)
    return f"<html><head><title>t</title></head><body>{body}</body></html>"


def test_sitemap_scope_filter_precedes_page_cap():
    """The original importer truncated the sitemap before filtering to the docs
    subtree; this pipeline must never lose an in-scope page that way."""
    blog = "".join(f"<url><loc>https://x.org/blog/p{i}.html</loc></url>" for i in range(300))
    sitemap = f'<urlset>{blog}<url><loc>https://x.org/docs/deep.html</loc></url></urlset>'
    fetcher = FakeFetcher(
        {"https://x.org/docs/": _page_html(), "https://x.org/docs/deep.html": _page_html()},
        texts={"https://x.org/sitemap.xml": sitemap},
    )
    robots = Robots(lambda url: "User-agent: *\nAllow: /")
    result = crawl_site("https://x.org/docs/", fetcher=fetcher, robots=robots,
                        max_pages=5, log=lambda *_: None)
    assert "https://x.org/docs/deep.html" in [u for u, _ in result.pages]
    assert all(u.startswith("https://x.org/docs/") for u in fetcher.fetched)


# --- triage -----------------------------------------------------------------

def test_triage_keeps_and_drops_by_rubric():
    pages = [make_page(0), make_page(1), make_page(2)]
    llm = FakeLLM(parse_results=[TriageBatch(verdicts=[
        PageVerdict(index=0, relevance=5, role="concept", note="core"),
        PageVerdict(index=1, relevance=1, role="marketing", note="ad"),
        PageVerdict(index=2, relevance=5, role="index", note="hub"),  # role-dropped
    ])])
    triaged = triage_pages(pages, "learn X", llm, log=lambda *_: None)
    assert [t.kept for t in triaged] == [True, False, False]


# --- mapper -----------------------------------------------------------------

def _plan_and_articles():
    pages = [make_page(0), make_page(1)]
    plan = OutlinePlan(
        topic_title="PyTorch", learner_question="why tensors", overview="the overview",
        articles=[
            ArticlePlan(slug="why-tensors", title="Why Tensors", question="q1",
                        model="m1", entry="e1", source_urls=[pages[0].url]),
            ArticlePlan(slug="autograd", title="Autograd", question="q2",
                        model="m2", entry="e2", source_urls=[pages[1].url]),
        ])
    articles = {
        "why-tensors": "# Why Tensors\n\nSee [Autograd](autograd.md).",
        "autograd": "# Autograd\n\nBack to [Why Tensors](why-tensors.md).",
    }
    triaged = [TriagedPage(p, 5, "concept", "n", True) for p in pages]
    return plan, articles, triaged


def test_mapper_builds_index_articles_relations():
    plan, articles, triaged = _plan_and_articles()
    mapped = build_mapped_import(
        plan=plan, articles=articles, triaged=triaged, goal="learn",
        seed_url="https://x.org/docs/", provider="gemini", model="gemini-3.6-flash",
    )
    assert mapped.concept.name == "PyTorch"
    keys = [a.source_key for a in mapped.artifacts]
    assert keys == ["kb::pytorch::index", "kb::pytorch::why-tensors", "kb::pytorch::autograd"]
    # every artifact idempotency-keyed and scoped for the writer's pruning
    assert all(a.metadata["sourceKey"] == a.source_key for a in mapped.artifacts)
    assert all(a.metadata["scope"] == "kb::pytorch" for a in mapped.artifacts)
    # relations: each article PART_OF index, later article PREREQUISITE earlier
    kinds = [(r.relation_type, r.from_key, r.to_key) for r in mapped.relations]
    assert (RelationType.PART_OF, "kb::pytorch::why-tensors", "kb::pytorch::index") in kinds
    assert (RelationType.PREREQUISITE, "kb::pytorch::autograd",
            "kb::pytorch::why-tensors") in kinds
    # provenance: one Source row per artifact, pointing at real page URLs
    assert mapped.artifacts[1].source["url"] == triaged[0].page.url


def test_mapper_rewrites_cross_links_to_entry_routes():
    plan, articles, triaged = _plan_and_articles()
    mapped = build_mapped_import(
        plan=plan, articles=articles, triaged=triaged, goal="learn",
        seed_url="https://x.org/docs/", provider="fake", model="m",
    )
    bodies = {a.source_key: a.body for a in mapped.artifacts}
    assert "(/entries/autograd)" in bodies["kb::pytorch::why-tensors"]
    assert "(/entries/why-tensors)" in bodies["kb::pytorch::autograd"]
    assert "(/entries/why-tensors)" in bodies["kb::pytorch::index"]  # TOC rewritten too
    assert ".md)" not in bodies["kb::pytorch::index"]
