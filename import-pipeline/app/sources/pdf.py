"""PDF source adapter: book/paper PDF -> StructuredDocument (via docling).

docling parses layout/reading order/tables and exports markdown; we re-use `parse_markdown`
to build the heading tree, keeping segmentation on one path. No OCR (assumes text PDFs).
docling is imported lazily so importing this package stays cheap (it pulls torch).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from app.models import SourceType
from app.parsing.markdown_parser import parse_markdown
from app.slugify import slugify
from app.sources.base import SourceFetchError, SourceResult

_converter: Any | None = None


def _get_converter() -> Any:
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter

        _converter = DocumentConverter()
    return _converter


def from_pdf_bytes(
    data: bytes, *, filename: str, source_type: SourceType = SourceType.BOOK
) -> SourceResult:
    title = Path(filename).stem or "Document"

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        result = _get_converter().convert(tmp_path)
        markdown = result.document.export_to_markdown()
    except Exception as error:  # docling raises various errors on malformed/encrypted PDFs
        raise SourceFetchError(f"Could not parse PDF {filename}: {error}") from error
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not markdown or not markdown.strip():
        raise SourceFetchError(f"No text extracted from PDF {filename} (is it a scan?)")

    doc = parse_markdown(markdown, fallback_title=title, source_type=source_type)
    return SourceResult(
        doc=doc, scope=f"pdf:{slugify(title)}", suggested_collection=doc.meta.title
    )
