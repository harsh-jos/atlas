"""Website / documentation source adapter.

Orchestration only: try each fetch strategy in priority order
(`llms-full.txt`/`llms.txt` → `sitemap.xml` → single page) and return the first that succeeds.
The tier logic itself lives in `strategies.py`; the URL/host rules live in `locations.py`; this
module just runs them and reports which one won.
"""

from __future__ import annotations

import logging

from app.models import SourceType
from app.sources.base import SourceResult
from app.sources.strategies import FetchContext, FetchStrategy, default_strategies

log = logging.getLogger(__name__)


def from_website(
    url: str,
    *,
    source_type: SourceType = SourceType.DOCS,
    strategies: list[FetchStrategy] | None = None,
) -> SourceResult:
    """Load a docs site, preferring the richest available source. `strategies` is injectable
    for testing; production uses the default priority order."""
    ctx = FetchContext(url=url, source_type=source_type)
    for strategy in strategies or default_strategies():
        result = strategy.attempt(ctx)
        if result is not None:
            report = result.report
            if report is not None:
                log.info("loaded %s via %s (%s)", url, report.strategy_used, report.detail)
            return result

    # default_strategies ends in single-page, which raises rather than returning None on a dead
    # site — so reaching here means a custom strategy list exhausted without a hit.
    raise RuntimeError(f"no fetch strategy produced a result for {url}")
