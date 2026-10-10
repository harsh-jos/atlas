"""Article composition: one streamed generation per planned article.

The writing rules ride in the system prompt of every article call through the
provider-neutral LLM client.
"""
from __future__ import annotations

from app.kb_pipeline.models import Page
from app.kb_pipeline.outline import ArticlePlan, OutlinePlan
from app.kb_pipeline.prompts import WRITING_RULES, compose_user
from app.kb_pipeline.structure import trim_to_chars

# generous but bounded: ~45k tokens of source material per article
SOURCE_BUDGET_CHARS = 180_000


def _sources_block(plan: ArticlePlan, pages_by_url: dict[str, Page]) -> str:
    sources = [pages_by_url[u] for u in plan.source_urls if u in pages_by_url]
    if not sources:
        return ""
    per_source = max(8_000, SOURCE_BUDGET_CHARS // len(sources))
    parts = []
    for page in sources:
        body = trim_to_chars(page.markdown, per_source)
        parts.append(f"=== SOURCE: {page.title}\n=== URL: {page.url}\n\n{body}")
    return "\n\n".join(parts)


def compose_articles(plan: OutlinePlan, pages_by_url: dict[str, Page], goal: str,
                     llm, only_slugs: set[str] | None = None,
                     log=print) -> dict[str, str]:
    """Returns {slug: article markdown}. only_slugs limits which articles are
    generated, but every article always sees the full sibling list so
    cross-links stay complete."""
    siblings = [{"order": i + 1, "slug": a.slug, "title": a.title, "question": a.question}
                for i, a in enumerate(plan.articles)]
    articles: dict[str, str] = {}
    for i, art in enumerate(plan.articles):
        if only_slugs is not None and art.slug not in only_slugs:
            continue
        log(f"  writing {i + 1}/{len(plan.articles)}: {art.title}")
        user = compose_user(
            goal=goal,
            topic_title=plan.topic_title,
            overview=plan.overview,
            article={"order": i + 1, "slug": art.slug, "title": art.title,
                     "question": art.question, "model": art.model, "entry": art.entry},
            siblings=siblings,
            sources=_sources_block(art, pages_by_url),
        )
        articles[art.slug] = llm.write(system=WRITING_RULES, user=user)
    return articles


def compose_index(plan: OutlinePlan, goal: str) -> str:
    """The map page is deterministic — the outline stage already wrote the
    overview, and a table of contents needs no model."""
    lines = [
        f"# {plan.topic_title}",
        "",
        f"> {plan.learner_question}",
        "",
        plan.overview,
        "",
        "## Reading order",
        "",
    ]
    for i, art in enumerate(plan.articles, 1):
        lines.append(f"{i}. **[{art.title}](articles/{art.slug}.md)** — {art.question}")
    lines += [
        "",
        f"*Built from official documentation for the goal: {goal}.*",
        "*Each article ends with the source pages it was written from.*",
        "",
    ]
    return "\n".join(lines)
