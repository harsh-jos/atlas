# LLM enricher — live test plan (run when an API key / local model is available)

Phase 3 is proven hermetically (16 tests via `httpx.MockTransport`, no network). This is the
checklist to validate it against a **real** model and tune it, the moment an endpoint exists.

## 0. Configure

In `import-pipeline/.env` (gitignored):

```ini
ENRICHER=llm
LLM_BASE_URL=https://api.deepseek.com/v1     # or local, e.g. http://localhost:11434/v1
LLM_API_KEY=...                              # omit for a local server that needs none
LLM_MODEL=deepseek-chat                      # or the local model name
LLM_MAX_CONCURRENCY=4
LLM_MAX_ENTRIES=25                           # keep small for the first runs (cost cap)
LLM_JSON_MODE=true                           # set false if a local server 400s on response_format
```

> **Using a small/local model (SLM)?** The enricher is built to treat the model as an optional
> booster, never a dependency. It recovers JSON from code fences / surrounding prose, coerces
> sloppy types, **rejects valid-but-garbage summaries** (too short, mostly punctuation, or echoing
> the title) and falls back to the deterministic summary, and a crash in the model can never sink
> an import (the entry is just left un-enriched). See `tests/test_enrichment.py` — 65 tests,
> incl. an adversarial battery. So a bad SLM degrades gracefully; it won't corrupt your library.

## 1. Smoke the connection first (cheapest possible check)

- One tiny markdown import with `LLM_MAX_ENTRIES=3` and confirm the job result includes
  `enrichment: {llmOk, llmFallback, capped}` with `llmOk > 0`.
- Confirm written entries carry `metadata.enrichedBy == "llm"`.
- Pull the plug mid-way (wrong key / stop the server) and confirm it **falls back loudly**:
  `enriched_by == "llm-fallback"`, summaries still present, job still succeeds. This is the
  fail-loud contract — verify it against reality, not just the unit test.

## 2. A/B vs the deterministic baseline

Goal: a side-by-side so we can judge whether the LLM is worth the cost.

- Add a deterministic-vs-llm comparison to the eval harness (small corpus: `fix-nested`,
  `wikipedia`, a slice of `mcp`). For each entry capture both summaries + tags.
- Metrics to compare (extend `eval/metrics.py`):
  - summary: avg length, % that are real sentences vs truncated lead paragraph, an eyeball sample.
  - tags: distinctness, % noise, overlap with deterministic, do they read like real topics.
  - cost/latency: tokens per entry, wall-clock at `LLM_MAX_CONCURRENCY`, $ per 100 entries.
- Save an `llm-vs-deterministic` report alongside the existing baseline JSONs.

## 3. Tune

- **Prompt** (`app/enrichment/llm_enricher.py` `_SYSTEM_PROMPT`): tighten summary length/voice and
  tag count/style based on the sample. Keep it returning strict JSON.
- **Cost cap** (`LLM_MAX_ENTRIES`): pick a sane default for large imports (MCP is ~1,800 entries);
  decide whether to enrich all, the top-N by level, or only non-structural entries.
- **Body excerpt** (`_BODY_EXCERPT_CHARS`, currently 4000): balance summary quality vs tokens.
- **Concurrency / timeout**: raise `LLM_MAX_CONCURRENCY` against a local model; confirm no
  rate-limit errors against DeepSeek.

## 4. Decide on Phase 4

Once summaries+tags are good, decide whether to let the LLM also propose **semantic relations**
(`USES` / `PREREQUISITE` / `CONTRASTS`) — the step that turns the outline into a real knowledge
graph. That extends `EnrichmentResult` + the mapper; scope it then.

## Done-criteria

- [ ] Live import succeeds with `enriched_by == "llm"` on real entries.
- [ ] Fallback verified live (kill the model → `llm-fallback`, job still ok).
- [ ] A/B report shows LLM summaries/tags are meaningfully better than deterministic.
- [ ] A cost-capped default chosen for large imports.
- [ ] Prompt tuned and committed.
