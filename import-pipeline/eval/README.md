# Import-pipeline evaluation harness

A reproducible, **dry-run** evaluation of the ingestion pipeline. It runs each source through
the real adapters (`app.runner.load_source`) and the real pipeline (`app.pipeline.build_import`)
and skips only the final DB write, so it never pollutes the database and is safe to run
repeatedly. Every run emits a versioned JSON report; a future pipeline version runs the same
harness and the two reports diff cleanly.

## Run

```bash
cd import-pipeline
uv run python -m eval.run_eval                 # local fixtures only (fast, offline, frozen)
uv run python -m eval.run_eval --live          # + live network sources (docs / article)
uv run python -m eval.run_eval --live --pdf    # + the heavy docling PDF path
uv run python -m eval.run_eval --only mcp,hono # a subset by id
uv run python -m eval.run_eval --live --pdf --label v2-llm-enricher   # label a comparison run
```

Reports land in `eval/reports/<label>-<timestamp>.json` (git-ignored). The `--label` becomes
the report's name — use it to tag the pipeline version under test (`baseline`, `v2-...`).

## Corpus

Three layers, chosen so each adapter path and each failure mode is exercised:

| id                  | tier               | what it tests |
|---------------------|--------------------|---------------|
| `fix-nested`        | markdown (frozen)  | deep hierarchy, code fence, table, internal SEE_ALSO links, frontmatter |
| `fix-tiny`          | markdown (frozen)  | merge-up rule: short leaves fold into parent |
| `fix-flat`          | markdown (frozen)  | single flat doc → exactly one entry, no relations |
| `mcp`               | website/llms-full  | large lossless llms-full.txt (~1.9 MB) |
| `hono`              | website/llms-full  | llms-full.txt that begins with a `<SYSTEM>` tag |
| `uv`                | website/llms.txt   | docs under a subpath (`/uv/`) |
| `starlette`         | website/sitemap    | multi-page sitemap crawl |
| `wikipedia`         | article            | single-page trafilatura extraction |
| `arxiv-transformer` | pdf                | docling PDF parse (downloads models on first run) |

The **frozen fixtures** (`eval/fixtures/*.md`) are the deterministic backbone of cross-version
comparison — they never change, so any metric movement on them is a pure pipeline change. The
**live sources** give a real-world snapshot; their content can drift, so the report stamps the
date and git commit.

## Metrics (`eval/metrics.py`)

Each source is scored on five concerns, all designed to move in a meaningful direction when the
pipeline improves:

- **coverage** — parsed sections, source vs retained chars (content loss is `retained_pct` < 100), merge ratio.
- **segmentation** — body-size stats, depth histogram, tiny / empty / oversized entry counts.
- **graph** — relation counts, `part_of_coverage` (1 edge per non-root = a clean tree), see_also, dangling edges.
- **enrichment** — summary coverage, avg tags, zero-tag and noise-tag rates.
- **provenance** — % entries with a traceable source URL.
- **fidelity** — code fences and table rows preserved in entry bodies.

## Comparing two runs

```bash
# baseline already in eval/reports/. After improving the pipeline:
uv run python -m eval.run_eval --live --pdf --label v2
# then diff the two JSONs (e.g. with jq / a notebook) on the metrics you changed.
```
