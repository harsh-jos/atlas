"""The learning map: question-first articles derived from the kept pages."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.kb_pipeline.models import slugify
from app.kb_pipeline.prompts import OUTLINE_SYSTEM, outline_user
from app.kb_pipeline.triage import TriagedPage


class ArticlePlan(BaseModel):
    slug: str = Field(description="kebab-case filename slug for the article")
    title: str
    question: str = Field(description="the one question this article answers")
    model: str = Field(description='completes "the learner will understand that ..."')
    entry: str = Field(description="suggested entry angle, distinct from siblings")
    source_urls: list[str] = Field(description="verbatim URLs of the pages to write from")


class OutlinePlan(BaseModel):
    topic_title: str = Field(description="short human name of the topic, e.g. 'PyTorch'")
    learner_question: str = Field(description="the single question the whole KB answers")
    overview: str = Field(description="3-5 sentence introduction to the knowledge base")
    articles: list[ArticlePlan]


def build_outline(triaged: list[TriagedPage], goal: str, max_articles: int,
                  llm, log=print) -> OutlinePlan:
    kept = [t for t in triaged if t.kept]
    entries = [f"- {t.page.url} | {t.role} | {t.page.title} | {t.note}" for t in kept]
    plan: OutlinePlan = llm.parse(
        system=OUTLINE_SYSTEM,
        user=outline_user(goal, entries, max_articles),
        schema=OutlinePlan,
    )

    known = {t.page.url for t in kept}
    cleaned: list[ArticlePlan] = []
    seen_slugs: set[str] = set()
    for art in plan.articles[:max_articles]:
        art.source_urls = [u for u in art.source_urls if u in known]
        if not art.source_urls:
            log(f"  dropping planned article with no valid sources: {art.title}")
            continue
        art.slug = slugify(art.slug or art.title)
        if art.slug in seen_slugs:
            art.slug = slugify(f"{art.slug}-{len(cleaned) + 1}")
        seen_slugs.add(art.slug)
        cleaned.append(art)
    plan.articles = cleaned
    log(f"  outline: {len(plan.articles)} articles for '{plan.topic_title}'")
    for i, art in enumerate(plan.articles, 1):
        log(f"    {i}. {art.title} — {art.question}")
    return plan
