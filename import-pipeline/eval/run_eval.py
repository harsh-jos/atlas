"""Run the import pipeline (dry-run, no DB writes) across a fixed corpus and emit a versioned
report for cross-version comparison.

  uv run python -m eval.run_eval                 # local fixtures only (fast, offline, frozen)
  uv run python -m eval.run_eval --live          # + live network sources (docs/article)
  uv run python -m eval.run_eval --live --pdf    # + the heavy docling PDF path
  uv run python -m eval.run_eval --only mcp,hono # run a subset by id

Each source is loaded through the *real* adapters (`app.runner.load_source`) and built through
the *real* pipeline (`app.pipeline.build_import`); only the final DB write is skipped. Reports
land in eval/reports/<timestamp>.json and a human-readable .md next to it. To compare a future
pipeline against this baseline, run the same command and diff the two JSON files.
"""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.pipeline import build_import
from app.runner import load_source
from eval.metrics import compute_metrics

EVAL_DIR = Path(__file__).resolve().parent
FIXTURES = EVAL_DIR / "fixtures"
REPORTS = EVAL_DIR / "reports"
PDF_CACHE = EVAL_DIR / ".cache"


@dataclass(slots=True)
class Source:
    id: str
    tier: str  # which adapter path this exercises
    kind: str  # load_source kind
    params: dict[str, Any]
    live: bool = False
    heavy: bool = False  # PDF / docling — opt-in
    note: str = ""


def _fixture(name: str, source_type: str) -> dict[str, Any]:
    return {"path": str(FIXTURES / name), "sourceType": source_type}


CORPUS: list[Source] = [
    # --- Frozen local fixtures: the deterministic backbone of cross-version comparison -----
    Source("fix-nested", "markdown", "markdown_file", _fixture("nested_docs.md", "DOCS"),
           note="deep hierarchy, code fence, table, internal SEE_ALSO links, frontmatter"),
    Source("fix-tiny", "markdown", "markdown_file", _fixture("tiny_leaves.md", "DOCS"),
           note="merge-up rule: short leaves fold into parent"),
    Source("fix-flat", "markdown", "markdown_file", _fixture("flat_article.md", "WEBSITE"),
           note="single flat doc -> exactly one entry, no relations"),
    # --- Live: llms-full.txt tier (the best path — one request, lossless markdown) ---------
    Source("mcp", "website/llms-full", "url",
           {"url": "https://modelcontextprotocol.io/", "sourceType": "DOCS"}, live=True,
           note="large llms-full.txt (~1.9MB)"),
    Source("hono", "website/llms-full", "url",
           {"url": "https://hono.dev/", "sourceType": "DOCS"}, live=True,
           note="medium llms-full.txt (~360KB)"),
    # --- Live: llms.txt index-only edge case (thin link list, not full content) ------------
    Source("uv", "website/llms.txt", "url",
           {"url": "https://docs.astral.sh/uv/", "sourceType": "DOCS"}, live=True,
           note="llms.txt index format — link list, not prose"),
    # --- Live: sitemap tier (multi-page crawl via trafilatura) -----------------------------
    Source("starlette", "website/sitemap", "url",
           {"url": "https://starlette.dev/", "sourceType": "DOCS"}, live=True,
           note="24-page sitemap crawl"),
    # --- Live: article tier (single page via trafilatura) ----------------------------------
    Source("wikipedia", "article", "article",
           {"url": "https://en.wikipedia.org/wiki/Knowledge_graph", "sourceType": "WEBSITE"},
           live=True, note="single article extraction"),
    # --- Live + heavy: PDF tier (docling) --------------------------------------------------
    Source("arxiv-transformer", "pdf", "pdf",
           {"_download": "https://arxiv.org/pdf/1706.03762", "filename": "attention.pdf",
            "sourceType": "PAPER"},
           live=True, heavy=True, note="docling PDF parse (downloads models on first run)"),
]


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=EVAL_DIR, text=True
        ).strip()
    except Exception:
        return "unknown"


def _ensure_pdf(url: str, filename: str) -> str:
    PDF_CACHE.mkdir(parents=True, exist_ok=True)
    dest = PDF_CACHE / filename
    if not dest.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "AtlasImportPipeline/0.1"})
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 (pinned arxiv URL)
            dest.write_bytes(resp.read())
    return str(dest)


def evaluate(source: Source, min_entry_chars: int) -> dict[str, Any]:
    params = dict(source.params)
    if "_download" in params:
        params["path"] = _ensure_pdf(params.pop("_download"), params["filename"])

    record: dict[str, Any] = {"id": source.id, "tier": source.tier, "note": source.note}
    t0 = time.perf_counter()
    try:
        result = load_source(source.kind, params)
        t_load = time.perf_counter() - t0
        mapped = build_import(
            result.doc,
            collection_name=result.suggested_collection,
            scope=result.scope,
            min_entry_chars=min_entry_chars,
        )
        t_build = time.perf_counter() - t0 - t_load
        record["status"] = "ok"
        record["scope"] = result.scope
        record["collection"] = result.suggested_collection
        record["timing_s"] = {"load": round(t_load, 2), "build": round(t_build, 3)}
        record["metrics"] = compute_metrics(result.doc, mapped, min_entry_chars=min_entry_chars)
    except Exception as error:  # fail loud per-source; keep the rest of the run going
        record["status"] = "error"
        record["error"] = f"{type(error).__name__}: {error}"
        record["timing_s"] = {"load": round(time.perf_counter() - t0, 2)}
    return record


def _select(args: argparse.Namespace) -> list[Source]:
    chosen = CORPUS
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        chosen = [s for s in chosen if s.id in wanted]
    else:
        if not args.live:
            chosen = [s for s in chosen if not s.live]
        if not args.pdf:
            chosen = [s for s in chosen if not s.heavy]
    return chosen


def _print_table(records: list[dict[str, Any]]) -> None:
    cols = f"{'id':<18}{'tier':<22}{'status':<8}{'entries':>8}{'PARTof%':>9}{'SEE':>5}{'sumry%':>8}{'load_s':>8}"
    print("\n" + cols)
    print("-" * len(cols))
    for r in records:
        if r["status"] != "ok":
            print(f"{r['id']:<18}{r['tier']:<22}{'ERROR':<8}  {r.get('error','')[:60]}")
            continue
        m = r["metrics"]
        print(
            f"{r['id']:<18}{r['tier']:<22}{'ok':<8}{m['entries']:>8}"
            f"{m['graph']['part_of_coverage_pct']:>9}{m['graph']['see_also']:>5}"
            f"{m['enrichment']['summary_coverage_pct']:>8}{r['timing_s']['load']:>8}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Atlas import-pipeline evaluation harness")
    parser.add_argument("--live", action="store_true", help="include live network sources")
    parser.add_argument("--pdf", action="store_true", help="include the heavy docling PDF path")
    parser.add_argument("--only", help="comma-separated source ids to run")
    parser.add_argument("--label", default="baseline", help="report label (e.g. pipeline version)")
    args = parser.parse_args()

    settings = get_settings()
    sources = _select(args)
    if not sources:
        raise SystemExit("no sources selected")

    print(f"running {len(sources)} source(s); min_entry_chars={settings.min_entry_chars}")
    records = []
    for source in sources:
        print(f"  → {source.id} ({source.tier}) ...", flush=True)
        records.append(evaluate(source, settings.min_entry_chars))

    report = {
        "label": args.label,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": _git_commit(),
        "python": platform.python_version(),
        "min_entry_chars": settings.min_entry_chars,
        "sources": records,
    }

    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = report["generated_at"].replace(":", "").replace("-", "")
    out = REPORTS / f"{args.label}-{stamp}.json"
    out.write_text(json.dumps(report, indent=2))

    _print_table(records)
    ok = sum(1 for r in records if r["status"] == "ok")
    print(f"\n{ok}/{len(records)} ok — report written to {out.relative_to(EVAL_DIR.parent)}")


if __name__ == "__main__":
    main()
