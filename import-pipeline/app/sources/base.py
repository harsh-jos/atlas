from __future__ import annotations

from dataclasses import dataclass, field

from app.models import StructuredDocument


class SourceFetchError(RuntimeError):
    """Raised when a source cannot be fetched or yields no usable content (fail loud)."""


@dataclass(slots=True)
class ImportReport:
    """How a source was actually loaded — surfaced to the job so a degraded import is visible.

    The baseline pipeline could silently fall from its best strategy down to a single-page
    scrape and still report success. This record makes the chosen path and any skipped content
    observable instead (fail loud, never silent).
    """

    strategy_used: str
    detail: str | None = None
    pages_found: int = 0
    pages_fetched: int = 0
    pages_skipped: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "strategyUsed": self.strategy_used,
            "detail": self.detail,
            "pagesFound": self.pages_found,
            "pagesFetched": self.pages_fetched,
            "pagesSkipped": self.pages_skipped,
            "notes": self.notes,
        }


@dataclass(slots=True)
class SourceResult:
    """What every source adapter returns: a parsed document plus import identity.

    `scope` is a stable identifier for this source (host, URL, file id). Combined with each
    entry's breadcrumb it forms the `source_key`, which is what makes re-imports idempotent —
    so it must NOT depend on the run, only on the source.
    """

    doc: StructuredDocument
    scope: str
    suggested_collection: str
    report: ImportReport | None = None
