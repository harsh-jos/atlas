from __future__ import annotations

from dataclasses import dataclass

from app.models import StructuredDocument


class SourceFetchError(RuntimeError):
    """Raised when a source cannot be fetched or yields no usable content (fail loud)."""


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
