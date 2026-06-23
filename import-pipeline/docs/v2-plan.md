# Import pipeline v2 — robustness + LLM enrichment

**Goal:** make ingestion *correct and honest* (no more silently-discarded sources), tighten
segmentation, turn crawled docs into a real graph, and add an **LLM enricher that calls a model
running elsewhere over HTTP** (DeepSeek API or a local OpenAI-compatible server) — behind the
existing `Enricher` seam so the rest of the pipeline never changes.

**Method:** every phase is its own set of green commits, gated by `ruff` + `pyright` + `pytest`,
and proven by re-running the eval harness (`eval/run_eval.py`) and diffing against
`eval/reports/baseline-*.json`. The baseline is our before/after evidence (rulebook §9.4).

**Design spine (rulebook §1):** the deterministic interior
(`StructuredDocument → segment → enrich → map → write`) stays. We fix the *boundary* (source
adapters), add two interior policies (oversize split, cross-page links), and inject enrichment
through the existing `Enricher` abstraction. Open/Closed throughout: we add classes, we don't
rewrite the spine.

---

## Guiding principles for this work (from the rulebook)

- **Fail loud, never silent (§5.1, §11).** The two worst bugs found are *silent fallbacks* — a
  whole docs site degrades to 1–3 entries and the job reports success. v2 makes the chosen
  strategy and any degradation **observable** in the job result, and turns "best source rejected"
  into a logged, visible event.
- **Wrap every external system in one client (§3.3).** The remote LLM gets exactly one gateway
  (`LLMClient`) that owns its URL, auth, timeout, retries, and response parsing. The pipeline
  depends on the `Enricher` abstraction, not on HTTP.
- **Parse at the boundary; trust the interior (§6.1).** LLM responses are parsed into a typed
  `EnrichmentResult` once; malformed output fails loudly, it does not degrade to an empty summary.
- **One module = one responsibility (§3.2).** `website.py` shrinks to orchestration; tier logic,
  URL resolution, markdown detection, link resolution, and enrichment each get their own home.
- **KISS / YAGNI (§1).** One LLM client (OpenAI-compatible covers DeepSeek *and* local servers).
  No semantic-relations work until summary+tags land. No caching until cost demands it.

---

## Phase 0 — Lock the bugs as failing tests (½ day)

Before fixing anything, capture the broken behavior as regression tests so the fix is *proven*,
not asserted (rulebook §9.2 contract tests, §9.4 before/after).

- Add recorded fixtures under `tests/fixtures/`: the head of a `<SYSTEM>`-prefixed `llms-full.txt`,
  a sitemap whose `<loc>`s are on a sibling host, and an oversized single-heading section.
- Add `tests/test_website_contract.py` asserting *today's* wrong outputs, marked `xfail` with the
  bug id. Each phase flips its `xfail` to a pass.

**Done when:** `pytest` is green and the xfails name H1/H2/H3.

---

## Phase 1 — Website adapter: correct + honest (2–3 days) · fixes H1, H2, H3

Split `website.py` into single-responsibility units and make tier selection a **strategy list**
(Open/Closed — new source strategies are added, not edited in):

```
app/sources/
  website.py        # orchestration only: run strategies in order, return first hit + a report
  strategies.py     # FetchStrategy protocol + LlmsFullText / Sitemap / SinglePage strategies
  locations.py      # candidate-URL resolution (subpath THEN domain root)  ← fixes H2
  http.py           # one shared, pooled httpx client                       ← rulebook §3.6
app/parsing/
  markdown_detect.py # strip <SYSTEM>… preamble; decide by structure        ← fixes H1
```

**H1 — `<SYSTEM>`-prefixed llms-full.txt rejected as HTML.**
Replace the "first char is `<` → not markdown" heuristic with a structural detector:

```python
# markdown_detect.py — parse, don't guess (§6)
_SYSTEM_PREAMBLE = re.compile(r"^\s*<SYSTEM>.*?</SYSTEM>\s*", re.IGNORECASE | re.DOTALL)
_ATX_HEADING = re.compile(r"^#{1,6}\s+\S", re.MULTILINE)

def strip_llm_preamble(text: str) -> str:
    """llms.txt convention: an optional <SYSTEM>…</SYSTEM> instruction block at the top."""
    return _SYSTEM_PREAMBLE.sub("", text, count=1)

def is_markdown_document(text: str) -> bool:
    body = strip_llm_preamble(text).lstrip()
    if body.startswith("<!doctype") or body.startswith("<html"):
        return False                       # a real HTML page
    return bool(_ATX_HEADING.search(body)) or len(body) > 500
```

**H2 — llms.txt/sitemap probed only at the domain root.**
`locations.py` yields candidates against the *doc subpath first*, then the root:

```python
def llms_candidates(url: str) -> list[str]:
    # https://docs.astral.sh/uv/  ->  .../uv/llms-full.txt, .../uv/llms.txt, /llms-full.txt, /llms.txt
    bases = _dedupe([_subpath_base(url), _domain_base(url)])
    return [urljoin(b, name) for b in bases for name in ("llms-full.txt", "llms.txt")]
```

**H3 — sitemap host filter drops canonical-redirect hosts.**
A site's own sitemap is authoritative, so compare by **registrable domain** (last two labels),
not exact host — `www.starlette.io`'s sitemap listing `starlette.dev` URLs is accepted:

```python
def same_site(a: str, b: str) -> bool:
    return _registrable(a) == _registrable(b)   # "www.starlette.io" ~ "starlette.dev" → compare apex
```

**Honesty (the point of this phase, rulebook §5/§11):** the orchestrator returns an
`ImportReport` alongside the document — `strategy_used`, `pages_found`, `pages_fetched`,
`pages_skipped`. The runner logs it and includes it in the job result. A degraded run
(llms.txt found but thin, sitemap empty, pages skipped) is now **visible**, never silent.

**Proof:** Phase-0 xfails for H1/H2/H3 flip to pass; eval harness shows hono ≫ 3 entries, uv ≫ 1.

---

## Phase 2 — Segmentation hygiene + a real graph (2–3 days) · fixes M1, M2

**M1 — oversized + empty entries.** Two small, named policies in `segment.py`, both config-driven
(no magic numbers, §4.1):

- *Oversize split:* a leaf body over `max_entry_chars` (new setting) is split at paragraph
  boundaries into ordered continuation entries linked `PART_OF` the original (`"… (part 2/3)"`).
  Keeps future embedding chunks sane.
- *Empty parents:* a heading with children but no prose of its own is kept as a structural node
  (it anchors the breadcrumb spine) but flagged `structural: true` in metadata so the app/graph
  can render it lightly. We do **not** fabricate a body (§5.1 — no faked content).

**M2 — cross-page `SEE_ALSO`.** Today links resolve only to same-document anchors, so every
multi-page crawl is a bare `PART_OF` tree. Introduce a `LinkResolver` (`app/links.py`) built once
per import from all entries (URL, slug, anchor → `source_key`). The mapper asks it to resolve each
out-link — full URL, relative path, or `#anchor` — into a target entry:

```python
class LinkResolver:
    """Resolve an entry's outbound href to another entry's source_key, or None."""
    def __init__(self, entries: list[EntryDraft], base_url: str | None) -> None: ...
    def resolve(self, href: str, *, from_key: str) -> str | None: ...
```

`mapping._relations` depends on this abstraction (Dependency Inversion), so the resolution
strategy can grow without touching relation construction.

**Proof:** eval shows starlette gains hundreds of `SEE_ALSO` edges; MCP unchanged or better;
`huge_entries`/`empty_body_entries` drop toward zero.

---

## Phase 3 — LLM enricher over HTTP (3–4 days) · fixes L1 (summary + tags)

The model runs **separately**; this repo holds only its URL. One OpenAI-compatible client serves
both DeepSeek (`https://api.deepseek.com/v1`) and local servers (Ollama / vLLM / LM Studio /
llama.cpp, e.g. `http://localhost:11434/v1`) — same `/chat/completions` + JSON response_format, so
**one gateway, config-only switch** (§3.4 "don't keep two ways").

```
app/enrichment/
  base.py          # Enricher Protocol (moved here) + EnrichmentResult typed model
  deterministic.py # DeterministicEnricher (moved, unchanged) — the always-available fallback
  llm_client.py    # LLMClient: owns base_url, api_key, model, timeout, retries, parsing
  llm_enricher.py  # LLMEnricher(Enricher): prompt -> client -> parse -> fill draft
  batch.py         # bounded-concurrency enrichment over a draft list
```

**Boundary contract (parse, don't validate, §6.1):**

```python
class EnrichmentResult(BaseModel):     # pydantic at the LLM boundary, like the HTTP API
    summary: str
    tags: list[str]

class LLMClient:
    """The one gateway to the external model. Owns transport, auth, retries, parsing."""
    def __init__(self, settings: LLMSettings, http: httpx.Client) -> None: ...
    def complete_json(self, system: str, user: str) -> dict: ...   # raises LLMError, never lies
```

**Config (§4.4 — config not code), all in `config.py` / `.env`:**
`LLM_BASE_URL`, `LLM_API_KEY` (optional for local), `LLM_MODEL`, `LLM_TIMEOUT_S`,
`LLM_MAX_CONCURRENCY`, `ENRICHER` (`deterministic` | `llm`), `LLM_MAX_ENTRIES` (cost cap).

**Selection by injection (Dependency Inversion, §3.5).** `build_import` already accepts
`enricher: Enricher | None`. A tiny `make_enricher(settings)` factory returns the configured one;
nothing in `segment`/`map`/`write` changes. Default stays `deterministic`, so v2 is safe with no
model configured.

**Fail loud, with an honest fallback (§5.1, §11).** On timeout / malformed JSON: retry once, then
fall back to the deterministic enricher **and tag the entry `enriched_by: "deterministic"`** so a
degraded enrichment is recorded, not invisible. The job report counts `llm_ok` vs `llm_fell_back`.

**Cost & throughput.** Enrich in `batch.py` with a bounded `asyncio` semaphore
(`LLM_MAX_CONCURRENCY`) and stop at `LLM_MAX_ENTRIES`, **reporting the cap** (§5.3 — no silent
truncation). 1,785 MCP entries × one call is real money/time; the cap + report make that a
deliberate choice, not a surprise.

**Tests (§9.2).** Record one real OpenAI-compatible response as a fixture; assert the client
parses it. Test the failure paths — timeout, non-JSON, missing field → `LLMError` → deterministic
fallback with the flag set. No network in CI.

---

## Phase 4 — optional, only when asked (YAGNI until then)

- **LLM-suggested semantic relations** (`USES` / `PREREQUISITE` / `CONTRASTS`): extend
  `EnrichmentResult` with proposed edges and let the mapper accept enricher-proposed relations.
  This is what finally makes it a *knowledge graph*, not an outline — but it's a mapping change, so
  it ships only after summary+tags are solid.
- **Enrichment caching** keyed by a body content-hash, so re-imports skip unchanged entries and
  don't re-spend tokens.
- **Stale-relation cleanup** on re-import (the long-standing TODO): delete edges no longer implied
  by the new structure, inside the same transaction.

---

## What this buys us, mapped to the baseline

| Bug (baseline) | Phase | Evidence it's fixed |
|---|---|---|
| H1 `<SYSTEM>` llms.txt discarded | 1 | hono: 3 → ~hundreds of entries |
| H2 subpath docs missed | 1 | uv: 1 → full docs set |
| H3 sitemap host filter | 1 | www↔apex sitemaps crawl correctly |
| silent fallback | 1 | `ImportReport.strategy_used` in job result |
| M1 empty/oversized entries | 2 | `empty_body`/`huge_entries` → ~0 |
| M2 tree-only graph | 2 | sitemap crawls gain `SEE_ALSO` edges |
| L1 shallow enrichment | 3 | semantic summaries + tags via remote LLM |
| semantic relations | 4 | `USES`/`PREREQUISITE`/`CONTRASTS` appear |

## Module map (target shape — additions, not rewrites)

```
app/
  sources/  website.py(slim)  strategies.py*  locations.py*  http.py*  article.py  pdf.py  markdown.py
  parsing/  markdown_parser.py  markdown_detect.py*
  enrichment/  base.py*  deterministic.py(moved)  llm_client.py*  llm_enricher.py*  batch.py*
  links.py*        # cross-page SEE_ALSO resolver
  report.py*       # ImportReport surfaced to the job
  segment.py(+policies)  mapping.py(+resolver)  pipeline.py  runner.py  writer.py  config.py(+LLM)
                   # * = new file
```

Each phase keeps every commit green and re-runs the eval harness, so "it's better" is measured,
not claimed.
