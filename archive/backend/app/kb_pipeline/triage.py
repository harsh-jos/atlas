"""LLM relevance triage: every fetched page judged against the learning goal.

This is the stage the old scraper-only pipeline was missing — garbage doesn't
slip through a filter here; the only pages that survive are ones the model
affirmatively kept, and every drop is recorded with its reason.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.kb_pipeline.models import Page
from app.kb_pipeline.prompts import TRIAGE_SYSTEM, triage_user
from app.kb_pipeline.structure import lead_text

BATCH_SIZE = 25
Role = Literal["concept", "tutorial", "guide", "reference", "api", "example",
               "faq", "changelog", "release-notes", "index", "marketing",
               "community", "other"]
DROP_ROLES = {"changelog", "release-notes", "marketing", "index"}


class PageVerdict(BaseModel):
    index: int = Field(description="the page's index from the input list")
    relevance: int = Field(ge=1, le=5)
    role: Role
    note: str = Field(description="one short sentence on what the page contributes")


class TriageBatch(BaseModel):
    verdicts: list[PageVerdict]


@dataclass
class TriagedPage:
    page: Page
    relevance: int
    role: str
    note: str
    kept: bool


def _entry(idx: int, page: Page) -> str:
    heads = "; ".join(page.headings[:6]) or "(no headings)"
    lead = lead_text(page.markdown) or "(no prose found)"
    return (f"[{idx}] {page.title}\n"
            f"    url: {page.url}\n"
            f"    headings: {heads}\n"
            f"    opens: {lead}")


def triage_pages(pages: list[Page], goal: str, llm,
                 keep_threshold: int = 3, log=print) -> list[TriagedPage]:
    results: list[TriagedPage] = []
    for start in range(0, len(pages), BATCH_SIZE):
        batch = pages[start:start + BATCH_SIZE]
        entries = [_entry(i, p) for i, p in enumerate(batch)]
        parsed: TriageBatch = llm.parse(
            system=TRIAGE_SYSTEM,
            user=triage_user(goal, entries),
            schema=TriageBatch,
        )
        by_index = {v.index: v for v in parsed.verdicts}
        for i, page in enumerate(batch):
            v = by_index.get(i)
            if v is None:
                # a page the model failed to judge is kept, not silently lost
                results.append(TriagedPage(page, 3, "other", "no verdict returned", True))
                continue
            kept = v.relevance >= keep_threshold and v.role not in DROP_ROLES
            results.append(TriagedPage(page, v.relevance, v.role, v.note, kept))
        done = min(start + BATCH_SIZE, len(pages))
        log(f"  triaged {done}/{len(pages)} pages")

    kept_n = sum(1 for r in results if r.kept)
    dropped = [r for r in results if not r.kept]
    log(f"  kept {kept_n}, dropped {len(dropped)}")
    for r in dropped:
        log(f"    - [{r.relevance}/{r.role}] {r.page.url} — {r.note}")
    return results
