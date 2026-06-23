"""Metrics over a built import — the comparable, versioned signal of pipeline quality.

Everything here is computed from the dry-run output (StructuredDocument + MappedImport), so it
never writes to the database and is safe to run repeatedly. The numbers are chosen to move in a
meaningful direction when the pipeline improves: more retained content, tighter segmentation,
better-connected graphs, richer enrichment, intact provenance. A future pipeline version runs
the same harness and the two JSON reports diff cleanly.
"""

from __future__ import annotations

import re
from statistics import mean, median
from typing import Any

from app.models import MappedImport, RelationType, Section, StructuredDocument

_FENCE = re.compile(r"^[ \t]*(```|~~~)", re.MULTILINE)
_TABLE_ROW = re.compile(r"^[ \t]*\|.*\|[ \t]*$", re.MULTILINE)
_ALPHA_WORD = re.compile(r"^[a-z][a-z.+#-]{2,}$")  # a "real" tag, not a number/fragment


def _all_sections(root: Section) -> list[Section]:
    out: list[Section] = []
    stack = [root]
    while stack:
        node = stack.pop()
        out.append(node)
        stack.extend(node.children)
    return out


def _pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


def _stats(values: list[int]) -> dict[str, float]:
    if not values:
        return {"min": 0, "median": 0, "mean": 0, "p90": 0, "max": 0}
    ordered = sorted(values)
    p90 = ordered[min(len(ordered) - 1, int(0.9 * len(ordered)))]
    return {
        "min": ordered[0],
        "median": round(median(ordered), 1),
        "mean": round(mean(ordered), 1),
        "p90": p90,
        "max": ordered[-1],
    }


def compute_metrics(
    doc: StructuredDocument,
    mapped: MappedImport,
    *,
    min_entry_chars: int,
) -> dict[str, Any]:
    """All comparable metrics for one source, grouped by concern."""
    entries = mapped.entries
    n = len(entries)

    # --- Coverage: how much of the parsed source survives into entries ---------------------
    sections = _all_sections(doc.root)
    source_chars = sum(len(s.content_md) for s in sections)
    retained_chars = sum(len((e.body or "")) for e in entries)

    # --- Segmentation: granularity and shape ----------------------------------------------
    body_lens = [len(e.body or "") for e in entries]
    levels = [e.metadata.get("headingLevel", 0) for e in entries]
    depth_hist: dict[int, int] = {}
    for lvl in levels:
        depth_hist[lvl] = depth_hist.get(lvl, 0) + 1
    tiny = sum(1 for b in body_lens if 0 < b < min_entry_chars)
    empty = sum(1 for b in body_lens if b == 0)
    huge = sum(1 for b in body_lens if b > 12_000)  # too big to be a clean RAG chunk

    # --- Graph: connectivity of the produced relations ------------------------------------
    part_of = [r for r in mapped.relations if r.relation_type == RelationType.PART_OF]
    see_also = [r for r in mapped.relations if r.relation_type == RelationType.SEE_ALSO]
    # A clean tree has exactly one PART_OF edge per non-root entry.
    part_of_coverage = _pct(len(part_of), max(n - 1, 1))
    keys = {e.source_key for e in entries}
    dangling = sum(
        1 for r in mapped.relations if r.from_key not in keys or r.to_key not in keys
    )

    # --- Enrichment: summaries and tags ---------------------------------------------------
    with_summary = sum(1 for e in entries if e.summary)
    summary_lens = [len(e.summary) for e in entries if e.summary]
    tag_counts = [len(e.tags) for e in entries]
    zero_tags = sum(1 for c in tag_counts if c == 0)
    all_tags = [t for e in entries for t in e.tags]
    noise_tags = sum(1 for t in all_tags if not _ALPHA_WORD.match(t))

    # --- Provenance: can the reader trace an entry back to its source ----------------------
    with_source_url = sum(1 for e in entries if e.source and e.source.get("url"))
    with_meta_url = sum(1 for e in entries if e.metadata.get("sourceUrl"))

    # --- Fidelity: structured content preserved in entry bodies ---------------------------
    joined = "\n".join(e.body or "" for e in entries)
    code_fences = len(_FENCE.findall(joined)) // 2
    table_rows = len(_TABLE_ROW.findall(joined))

    return {
        "entries": n,
        "coverage": {
            "parsed_sections": len(sections),
            "source_chars": source_chars,
            "retained_chars": retained_chars,
            # >100% is normal: merged leaves add their heading text. <100% means content dropped.
            "retained_pct": _pct(retained_chars, source_chars),
            "merge_ratio": round(len(sections) / n, 2) if n else 0,
        },
        "segmentation": {
            "body_chars": _stats(body_lens),
            "depth_histogram": dict(sorted(depth_hist.items())),
            "max_depth": max(levels) if levels else 0,
            "tiny_entries": tiny,
            "tiny_pct": _pct(tiny, n),
            "empty_body_entries": empty,
            "empty_pct": _pct(empty, n),
            "huge_entries": huge,
        },
        "graph": {
            "relations": len(mapped.relations),
            "part_of": len(part_of),
            "see_also": len(see_also),
            "part_of_coverage_pct": part_of_coverage,
            "dangling_relations": dangling,
        },
        "enrichment": {
            "summary_coverage_pct": _pct(with_summary, n),
            "avg_summary_chars": round(mean(summary_lens), 1) if summary_lens else 0,
            "avg_tags": round(mean(tag_counts), 2) if tag_counts else 0,
            "zero_tag_entries": zero_tags,
            "zero_tag_pct": _pct(zero_tags, n),
            "distinct_tags": len(set(all_tags)),
            "noise_tags": noise_tags,
            "noise_tag_pct": _pct(noise_tags, len(all_tags)),
        },
        "provenance": {
            "source_url_pct": _pct(with_source_url, n),
            "metadata_url_pct": _pct(with_meta_url, n),
        },
        "fidelity": {
            "code_fences_retained": code_fences,
            "table_rows_retained": table_rows,
        },
    }
