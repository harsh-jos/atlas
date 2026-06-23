# Ingestion pipeline — baseline evaluation

**Date:** 2026-06-23 · **Branch:** `ingestion-eval` · **Pipeline:** v0.1 (deterministic, no LLM)
**Method:** dry-run of the real adapters + pipeline against a 9-source corpus (`eval/run_eval.py`),
plus a live idempotent DB write check (`smoke_pipeline.py`). Raw numbers:
`eval/reports/baseline-*.json`.

---

## 1. What the pipeline is

A local Python service (FastAPI + a single async SQLite-queued worker) that turns external
knowledge into linked Atlas entries in the same Postgres DB the Next.js app reads. It is
**deterministic by design — there is no LLM anywhere in the path** (the enricher is a stubbed,
swappable `Protocol`).

```
source ─▶ adapter ─▶ StructuredDocument ─▶ segment ─▶ enrich ─▶ map ─▶ write ─▶ Postgres
         (fetch)     (one typed model)     (entries)  (stub)   (rows)  (idempotent upsert)
```

### Supported inputs & the stack

| Input | Adapter | Library | Strategy |
|-------|---------|---------|----------|
| Docs site | `sources/website.py` | `httpx` + stdlib XML | tier 1 `llms-full.txt`/`llms.txt` → tier 2 `sitemap.xml` (crawl ≤200 pages) → tier 3 single page |
| Article | `sources/article.py` | `trafilatura` | main-content HTML→markdown extraction |
| PDF | `sources/pdf.py` | `docling` | layout/reading-order/table extraction → markdown (no OCR by design) |
| Markdown | `sources/markdown.py` | hand-rolled | raw `.md` text or file |

Everything normalises to one `StructuredDocument`, then a shared interior runs once:
**segment** (`segment.py`, one entry per subsection, short leaves merge up, heading hierarchy →
`PART_OF`), **enrich** (`enrich.py`, lead-paragraph summary + frequency-keyword tags), **map**
(`mapping.py`, internal links → `SEE_ALSO`), **write** (`writer.py`, one atomic transaction,
idempotent on `(collectionId, metadata.sourceKey)`).

### Design ceiling (stated in the README, confirmed here)

No vector embeddings / GraphRAG, no OCR, no LLM enrichment, no stale-relation cleanup on
re-import. Only two of the five relation types are ever produced: `PART_OF` (structure) and
`SEE_ALSO` (links). `USES` / `PREREQUISITE` / `CONTRASTS` require semantic understanding the
deterministic pipeline cannot do — **the output is a document outline tree, not yet a
knowledge graph.**

---

## 2. Baseline results

| id | tier | entries | PART_OF cov | SEE_ALSO | summary% | load s | verdict |
|----|------|--------:|------------:|---------:|---------:|-------:|---------|
| fix-nested | markdown (frozen) | 5 | 100% | 4 | 100% | 0.0 | ✅ ideal |
| fix-tiny | markdown (frozen) | 2 | 100% | 0 | 100% | 0.0 | ✅ merge works |
| fix-flat | markdown (frozen) | 1 | — | 0 | 100% | 0.0 | ✅ no invented structure |
| mcp | website/llms-full | 1785 | 100% | 314 | 90% | 0.6 | ⚠️ works, but giant/empty entries |
| **hono** | website/llms-full | **3** | 100% | 0 | 100% | 0.4 | ❌ **360 KB silently discarded** |
| **uv** | website/llms.txt | **1** | — | 0 | 100% | 0.8 | ❌ **subpath docs missed** |
| starlette | website/sitemap | 328 | 100% | **0** | 88% | 17.6 | ⚠️ tree only, no cross-links |
| wikipedia | article | 6 | 100% | 0 | 100% | 0.5 | ⚠️ one 14.7 KB blob |
| arxiv-transformer | pdf | 26 | 100% | 0 | 100% | 28 | ✅ clean, tables kept |

**DB write path:** ✅ `smoke_pipeline` wrote, re-imported idempotently (no duplicates), and
self-cleaned against the live Neon DB.

**What works well:** the markdown interior is solid — segmentation granularity, merge-up,
`PART_OF` coverage (100% everywhere = clean trees), idempotent writes, and provenance (100% of
web entries carry a source URL). Code fences and tables survive (MCP: 800 fences / 1464 table
rows; PDF: 55 table rows). docling does a genuinely good job on the PDF (26 well-sized entries,
no empty/tiny/oversized).

---

## 3. Confirmed findings (root-caused live)

### 🔴 H1 — `llms-full.txt` beginning with `<SYSTEM>…` is rejected as "HTML"
`website._looks_like_markdown` returns `False` for any text whose first non-space char is `<`.
Hono's `llms-full.txt` (358 KB, 769 parseable sections, 768 headings) opens with
`<SYSTEM>This is the full developer documentation for Hono.</SYSTEM>` — a **common llms.txt
convention**. The whole lossless doc is discarded; the pipeline silently falls back to scraping
the homepage → **3 entries instead of ~768.** Fail-silent: the job reports success.
*Fix:* detect markdown by heading/structure, not a leading `<`; strip a leading `<SYSTEM>…>`
preamble. (One-line region in `website.py`.)

### 🔴 H2 — `llms.txt` / `sitemap.xml` are probed at the domain root, ignoring the doc subpath
`website._base("https://docs.astral.sh/uv/")` → `https://docs.astral.sh/`, so the pipeline
fetches `/llms.txt` (404) and never sees the real `/uv/llms.txt` (200, present). uv's docs fall
all the way to tier 3 → **1 entry for an entire documentation set.** Hits every project hosted
under a shared docs domain (`/uv/`, `/ruff/`, readthedocs `/en/stable/`, …).
*Fix:* probe the path prefix before the domain root.

### 🟠 H3 — sitemap host filter drops canonical-redirect hosts
`_sitemap_urls` keeps only locs whose host equals the *input* host. `www.starlette.io`'s sitemap
lists `starlette.dev` URLs → **all 24 filtered out** → falls to single page. Common with
`www`↔apex and docs-CDN setups. (Using the canonical `starlette.dev` directly gave the correct
328-entry crawl.)
*Fix:* compare registrable domain, or follow the sitemap's own host.

### 🟠 M1 — segmentation produces empty and oversized entries
One entry per heading means **heading-only section dividers become empty-body entries** (MCP:
**129 empty**, 58 tiny) and **headings whose content has no sub-headings become monsters** (MCP:
17 entries > 8 KB, including **90 KB and 79 KB**; Wikipedia: a single 14.7 KB entry). Empty nodes
are low-value graph clutter; oversized nodes are poor future RAG/embedding chunks. 81% of MCP
entries land in the healthy 200–2000 char band — the tails are the problem.
*Fix:* drop/merge empty heading-only nodes; split oversized bodies on sub-structure or a char cap.

### 🟠 M2 — the graph is a tree; cross-references are lost on the paths that matter
`SEE_ALSO` only resolves links whose `#fragment` matches a heading anchor **within the same
parsed document**. On the multi-page sitemap crawl (starlette, 328 entries) and on single
articles/PDFs, that's **0 cross-links** — only the `PART_OF` spine survives. Heavily
cross-linked docs import as a pure outline. (It works only on single-file llms-full.txt: MCP got
314.)
*Fix:* resolve cross-page links by URL/slug, not just same-doc anchors.

### 🟡 L1 — enrichment is shallow (by design, but measured)
Summaries = first prose paragraph; tags = top-4 frequency keywords + source type. Coverage is
high (88–100% summaries, ~4.5 tags, <3% noise), but there's **no semantic summary, no real
tagging, and none of the three semantic relation types.** This is the stubbed `Enricher` —
the intended home for a DeepSeek/local-LLM upgrade.

### 🟡 L2 — minor
- **PDF entries have no source URL** (`metadata_url% = 0`) — provenance is title + `ref` only; no
  deep link. Acceptable, but worth a page-anchor strategy later.
- **docling loads RapidOCR models** on every PDF despite the "no OCR" design — startup cost
  (~28 s here, mostly model load); consider disabling the OCR pipeline explicitly.
- **No stale-edge cleanup** on re-import (already documented) — restructured re-imports leak old
  relations.

---

## 4. Recommended next steps (priority order)

1. **Fix the two silent-data-loss bugs (H1, H2).** Highest value, smallest change — today they
   turn whole documentation sites into 1–3 entries and *report success*. Add a regression to the
   harness (hono and a subpath doc must yield many entries).
2. **Make fail-loud honest (H1/H3 corollary).** When tier 1 is skipped or a crawl yields ≪ the
   sitemap size, log/surface it instead of silently degrading.
3. **Segmentation hygiene (M1):** drop empty heading-only entries; cap/split oversized bodies.
   This is also the groundwork for good embedding chunks.
4. **Cross-page `SEE_ALSO` (M2):** resolve links by URL→slug so crawled docs become a real graph.
5. **LLM enricher behind the existing `Protocol` (L1):** semantic summaries, real tags, and the
   `USES`/`PREREQUISITE`/`CONTRASTS` edges that make this a knowledge graph rather than an outline.
   The interface is already there; this is additive.

Re-run `uv run python -m eval.run_eval --live --pdf --label v2` after any of these and diff
against this baseline to prove the improvement.

## 5. Where I may need you

- **Scope of v2:** is the near-term goal *correct, complete ingestion* (fixes 1–4, stay
  deterministic) or *the AI layer* (embeddings + LLM enricher, fix 5)? That decides what to build
  first.
- **LLM choice/budget** if we do fix 5 (the code mentions DeepSeek / local LLM) — provider, cost
  cap per import, local vs API.
- **Corpus additions:** if there are specific sources you actually plan to import (a particular
  docs site, book PDFs, a paper set), name them and I'll fold them into the harness so we
  optimise for *your* content, not just representative samples.
