"""KB pipeline output -> a MappedImport the existing ImportWriter persists.

Reusing the writer buys quota enforcement, idempotent re-builds keyed on
sourceKey, provenance rows, and stale-artifact pruning — the KB becomes a
first-class citizen of the library instead of a parallel store.
"""

from __future__ import annotations

import re

from app.core.enums import RelationType, SourceType
from app.core.slugify import slugify
from app.kb_pipeline.compose import compose_index
from app.kb_pipeline.models import Page
from app.kb_pipeline.outline import OutlinePlan
from app.kb_pipeline.triage import TriagedPage
from app.pipeline.models import ArtifactSpec, ConceptSpec, MappedImport, RelationSpec


def build_mapped_import(
    *,
    plan: OutlinePlan,
    articles: dict[str, str],
    triaged: list[TriagedPage],
    goal: str,
    seed_url: str,
    provider: str,
    model: str,
) -> MappedImport:
    scope = f"kb::{slugify(plan.topic_title)}"
    pages_by_url: dict[str, Page] = {t.page.url: t.page for t in triaged}
    written = [a for a in plan.articles if a.slug in articles]

    # The writer allocates artifact slugs from titles with the same slugify, so
    # in-app links can be predicted. A collision with a pre-existing slug gets a
    # suffix and orphans that one link — visible, not destructive.
    entry_slug = {a.slug: slugify(a.title) for a in written}
    index_title = f"{plan.topic_title} — Learning KB"

    common = {"scope": scope, "seedUrl": seed_url, "goal": goal,
              "provider": provider, "model": model}

    specs: list[ArtifactSpec] = [
        ArtifactSpec(
            source_key=f"{scope}::index",
            title=index_title,
            summary=plan.learner_question,
            body=_rewrite_links(compose_index(plan, goal), entry_slug),
            tags=["learning-kb", "index"],
            metadata={"sourceKey": f"{scope}::index", "kind": "kb-index", **common},
            source={"sourceType": SourceType.DOCS, "title": plan.topic_title, "url": seed_url},
        )
    ]
    relations: list[RelationSpec] = []

    for order, art in enumerate(written, 1):
        key = f"{scope}::{art.slug}"
        first_page = next(
            (pages_by_url[u] for u in art.source_urls if u in pages_by_url), None
        )
        specs.append(
            ArtifactSpec(
                source_key=key,
                title=art.title,
                summary=art.question,
                body=_rewrite_links(articles[art.slug], entry_slug),
                tags=["learning-kb"],
                metadata={
                    "sourceKey": key, "kind": "kb-article", "order": order,
                    "question": art.question, "mentalModel": art.model,
                    "sources": art.source_urls, **common,
                },
                source={
                    "sourceType": SourceType.DOCS,
                    "title": first_page.title if first_page else plan.topic_title,
                    "url": first_page.url if first_page else seed_url,
                },
            )
        )
        relations.append(RelationSpec(
            from_key=key, to_key=f"{scope}::index",
            relation_type=RelationType.PART_OF,
        ))
        if order > 1:
            relations.append(RelationSpec(
                from_key=key, to_key=f"{scope}::{written[order - 2].slug}",
                relation_type=RelationType.PREREQUISITE, note="reading order",
            ))

    return MappedImport(
        concept=ConceptSpec(name=plan.topic_title, description=plan.learner_question),
        artifacts=specs,
        relations=relations,
    )


def _rewrite_links(markdown: str, entry_slug: dict[str, str]) -> str:
    """Article cross-links are written as `(slug.md)` / `(articles/slug.md)`;
    in Atlas the artifact lives at /entries/<slug>."""

    def repl(match: re.Match) -> str:
        plan_slug = match.group(1)
        target = entry_slug.get(plan_slug)
        return f"(/entries/{target})" if target else match.group(0)

    return re.sub(r"\((?:articles/)?([a-z0-9-]+)\.md\)", repl, markdown)
