# Atlas import pipeline

A local Python service that imports outside knowledge into Atlas — documentation sites,
articles, PDFs (books/papers), and markdown — splitting each source into linked entries in
the same Postgres database the Next.js app reads.

It is **deterministic by design**: parsing and segmentation are plain code. There is no LLM in
the pipeline (the enricher is a stubbed, swappable interface), and no agent framework. Run it
when you want to import something; leave it off the rest of the time.

## How it works

```
source ─▶ adapter ─▶ StructuredDocument ─▶ segment ─▶ enrich ─▶ map ─▶ write ─▶ Postgres
         (fetch)     (one typed model)     (entries)  (stub)   (rows)  (idempotent)
```

- **Adapters** (`app/sources/`) normalise every input to one `StructuredDocument`:
  - **Docs site** — tries `/llms-full.txt` and `/llms.txt` first (one request, lossless),
    then `/sitemap.xml`, then falls back to single-page extraction.
  - **Article** — single page via [trafilatura].
  - **PDF** — book/paper via [docling] (no OCR; assumes text PDFs).
  - **Markdown** — raw text or `.md` file.
- **Segmenter** (`app/segment.py`) — one entry per subsection; the heading hierarchy becomes
  `PART_OF` relations and internal links become `SEE_ALSO`. Short leaf sections merge upward.
- **Enricher** (`app/enrichment/`) — `deterministic` summary (lead paragraph) + keyword tags by
  default, or an `llm` enricher that calls an external OpenAI-compatible model (DeepSeek or a
  local server) behind the same `Enricher` protocol. Set `ENRICHER=llm` + `LLM_BASE_URL`; it
  falls back to deterministic (loudly, flagged per entry) on any failure or past a cost cap.
- **Writer** (`app/writer.py`) — upserts keyed on `(collectionId, metadata.sourceKey)`, so
  re-importing the same source updates entries in place instead of duplicating them.

Jobs run through a SQLite-backed queue (`app/queue.py`) with a single async worker, so the
HTTP call returns immediately and you poll for status.

## Setup

Requires [uv](https://docs.astral.sh/uv/) and Python 3.13.

```bash
cd import-pipeline
cp .env.example .env          # set DATABASE_URL to the same DB as the Next.js app
uv sync                       # creates .venv and installs dependencies
```

First PDF import downloads docling's layout models (a few hundred MB), once.

## Run

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The Next.js app calls it via `IMPORT_SERVICE_URL` (default `http://localhost:8000`). Use the
**Import** page in the app, or curl directly:

```bash
# Docs site (lossless via llms-full.txt when available)
curl -X POST localhost:8000/imports \
  -H 'Content-Type: application/json' \
  -d '{"kind":"url","url":"https://adk.dev/","collectionName":"Google ADK"}'

# Poll
curl localhost:8000/imports/<jobId>

# File upload (PDF or .md)
curl -X POST localhost:8000/imports/file -F file=@paper.pdf -F collectionName="Papers"
```

`kind` is one of `url` (docs site), `article`, `markdown` (with `text`). Optional:
`collectionName`, `sourceType` (`BOOK|PAPER|DOCS|TUTORIAL|COURSE|WEBSITE`).

## Develop

```bash
uv run ruff check .
uv run pytest                 # interior + adapter tests (no network, no DB)
uv run python -m app.scripts.preview url https://adk.dev/   # dry-run, prints stats, no write
```

`app/scripts/smoke_pipeline.py` round-trips a small import against the real DB and cleans up.

## Not included (yet)

- Vector embeddings / GraphRAG, OCR / scanned PDFs.
- LLM-suggested semantic relations (`USES`/`PREREQUISITE`/`CONTRASTS`) — the LLM enricher fills
  summaries and tags today; relations are still structural (`PART_OF`) + link-derived (`SEE_ALSO`).
- Stale-relation cleanup: re-importing a source whose structure changed leaves old edges.

[trafilatura]: https://trafilatura.readthedocs.io/
[docling]: https://docling-project.github.io/docling/
