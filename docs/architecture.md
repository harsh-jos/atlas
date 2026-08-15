# Atlas — technical direction

> **About this doc:** how the [vision](./vision.md) becomes a system. Written 2026-07-24 at the
> start of the agent pivot. It records *decisions and their reasons* — not an API reference.
> Where a decision is still open, it says so explicitly rather than guessing.

## The shape

```
┌─ Next.js 16 — frontend only ─────────┐  HTTP   ┌─ Python — the backend of record ──┐
│  chat home · artifact reader         │◀──SSE──▶│  ADK agent · pipeline · linker    │
│  curation UI · concepts · graph      │         │  search · auth · all writes       │
└──────────────────────────────────────┘         └──────────────┬────────────────────┘
                                                                │
                                                 PostgreSQL + pgvector
```

**One backend, one database.** Next.js no longer touches Postgres — see
[the consolidation](#backend-consolidation-typescript--python) for why and what it costs.

### Why the agent lives in the Python service, not in Next.js

ADK is Python-first and most complete there, and — decisively — **the agent's most important
tool is the ingestion pipeline, which is already Python**. Putting the agent beside it means
`preview_source` is a function call, not an HTTP round-trip into another process that then has
to stream job status back. The pipeline stops being a service the agent calls and becomes a
library the agent *uses*. That is the whole reason this is cheap to build.

Next.js keeps what it is good at: rendering, reading, and the curation UI. It proxies the chat
stream and never talks to Gemini directly.

## Backend consolidation (TypeScript → Python)

**Decided 2026-07-24.** Two data-access layers currently write the same tables — Prisma from
TypeScript, psycopg from Python. With the agent owning ingestion, linking, enrichment, and
concept assignment, **nearly every write originates in Python**, leaving Next.js to own CRUD it
does not author. One writer, one schema owner.

This is a **consolidation, not a rewrite** — the distinction matters, because the single most
valuable thing in the repo is already in the target language.

| Keep | Why |
|---|---|
| `import-pipeline/` — adapters, segmenter, enricher, mapper, writer, tests | Already Python, already tested, and it **is** the known-source ingestion path below. Rebuilding it would mean rewriting the best asset in the language it is already written in. |
| The reading UI and components | The strongest part of the frontend; the design register lives here. |
| Design tokens in `globals.css` | Taste did not change. |
| The data model | The Prisma schema remains the *specification* even as the implementation moves. |

| Goes | Replaced by |
|---|---|
| `app/api/*` route handlers | The Python API. |
| `lib/*.ts` Prisma data access, `lib/db.ts` | Fetches from Server Components. |
| The library-grid home | The chat home. |
| Prisma client + `prisma migrate` | SQLAlchemy + Alembic. Six models — tractable. |

Server Components stay Server Components; they change *data source*, not nature.

**The honest cost:** TypeScript loses typed database access. That is acceptable only because TS
stops touching the database at all — the boundary becomes the API's response shapes, which must
be **parsed at the edge, not trusted**, exactly as `CLAUDE.md` requires of any external input.

## The agent

**Model:** Gemini on Vertex AI (existing credits). ADK Python.

### Tools

| Tool | Kind | Does |
|---|---|---|
| `search_web` | `AgentTool` wrapping a search sub-agent | Open-web discovery via ADK's built-in `google_search`. |
| `search_knowledge_base` | FunctionTool | Full-text (and later vector) search over the user's own artifacts. |
| `preview_source` | FunctionTool | Fetch + segment a candidate source and return the artifact outline **without writing anything**. |
| `propose_links` | FunctionTool | Run the multi-signal linker over a preview — new × KB and new × new — and return typed, scored, justified candidate edges for review. |
| `commit_artifacts` | FunctionTool | Persist a user-approved subset of a preview, plus the surviving edges. |

**`search_web` is wrapped in a sub-agent deliberately.** Gemini historically rejected mixing
built-in tools with function declarations in one agent (`Tool use with function calling is
unsupported`); [ADK Python ≥1.16 removed that limitation](https://google.github.io/adk-docs/tools/limitations/),
but the split is still the right architecture — the researcher gets its own instructions,
its own model tier, and its own failure domain. Pin the ADK version and verify this live before
relying on either behaviour.

**`search_knowledge_base` is not optional.** It is what stops Atlas from being a scraper: the
agent must know what you already have before proposing anything, so it can say "you already
have three artifacts on HNSW — want me to extend that concept instead?" and so new artifacts
link into old ones at ingest time rather than landing orphaned.

### Two ingestion paths

Discovery is not the only way in, and the second path is the one that must not be forgotten:

- **"I don't know what to read"** → search agent → candidate sources → preview.
- **"I know my source"** — *learn PyTorch from the official docs, nothing else* → **no web search
  at all** → deterministic crawl + segment → the agent organises what came back.

**The LLM does not do the crawling.** The pipeline already resolves `/llms-full.txt` →
`sitemap.xml` → single-page extraction, and segments by heading hierarchy. For a 2,000-page
documentation site, having a model read every page is slow, expensive, and non-deterministic;
the crawler gets the structure for free and cannot hallucinate it. Spend tokens on **judgement**
— organising, naming concepts, linking, summarising — not on parsing HTML.

Consequence for the agent: `search_web` must be **skippable**. Recognising "the user already
named the source" and going straight to `preview_source` is a first-class path, not a fallback.

### The preview/commit split — the important one

The existing pipeline already separates *deriving* an import from *writing* it:

```
build_import(doc, ...) -> MappedImport   # collection + entries + relations, pure, no DB
write(mapped_import)                     # the only thing that touches Postgres
```

`preview_source` stops at `build_import` and returns the outline — every artifact title,
breadcrumb, size, and the relations that would be created. `commit_artifacts` takes the
preview plus the user's selection and runs the writer.

This is what makes the curation step real: the user chooses **actual artifacts**, not a URL and
a leap of faith. It requires no new pipeline machinery — only somewhere to park a `MappedImport`
between the two calls. The existing SQLite job store is the natural home; a preview is a job
whose result is a `MappedImport` awaiting approval, with a TTL.

Selection must be per-artifact, not per-source. Dropping a subset means dropping relations that
point at excluded artifacts — the mapper needs a filter step, and it must not silently produce
dangling edges.

The selection also carries **where it lands**. The agent proposes a concept name with every
preview; at commit the user keeps it, renames it, or picks a concept they already have. The
preview reports which existing concept the proposed name would extend, so the chooser defaults
to that honestly rather than letting the outcome hinge on whether the agent happened to type the
same words. A concept's name is its identity — committing under a name already in use extends
that concept — and an explicitly chosen concept is never renamed to the import's phrasing.
There is no other way to create a concept: one comes into being only because artifacts were
committed into it.

### Long-running runs

Organising a whole documentation site is an hours-long job, and the user is willing to wait. ADK
supports this natively — `LongRunningFunctionTool`, plus pause/resume/cancel with session state
persisted externally (Postgres, which we already run).

Three rules make it survivable:

**Write as you go — you don't need long outputs, you need many bounded ones.** Never accumulate
an enormous result to emit at the end: context grows, cost compounds, and one crash loses
everything. Each unit of work persists its artifact immediately. Context stays bounded, total
output becomes effectively unbounded, and a failure costs one unit rather than an hour. The
artifact model is already the chunking; the job queue already has poll-for-status.

**Curate the outline, not the output.** A long autonomous run collides with the non-negotiable
that *the user curates*. The resolution falls out of the deterministic path above: the crawl
yields the full outline **instantly, with no LLM**, so the user prunes which sections earn a
place — and only then does the long run organise what was chosen. Curation stays the spine, and
nobody waits an hour to discover it imported things they didn't want.

**Bound it and report honestly.** Max iterations, a cost ceiling, and checkpoints. If a run is
truncated or a section fails, say so — never a silent partial import presented as a complete one.

**Pin the ADK version.** [Release 1.27.0 regressed sub-agents with sequential long-running tools
failing to resume](https://github.com/google/adk-python/issues/5349) — precisely this
architecture. Make resume-after-crash something tested on day one, not discovered in month two.

### Replacing DeepSeek

`Enricher` is already a Protocol and `enrich_llm.py` already talks to an OpenAI-compatible
endpoint via a configurable `llm_base_url`. Vertex exposes an OpenAI-compatible surface, so the
cheapest path is a config swap; the cleaner path is a `GeminiEnricher` on the `google-genai`
SDK, sharing credentials with the agent. Either way: **one LLM provider in the system.**

Keep the deterministic enricher as the fallback, and keep enrichment *upgrading* entries rather
than blocking them — that property is worth more than the model behind it.

### Accumulating responsibilities — design pass pending

> **The agent's scope is growing deliberately and has not yet been designed as a whole.** This is
> the running inventory, kept so the eventual design pass starts from the full picture instead of
> whatever was most recently discussed. Adding to this list is fine; pretending it's designed is not.

| # | Responsibility | Shape |
|---|---|---|
| 1 | Converse and scope the curiosity | conversational |
| 2 | Research the open web | conversational |
| 3 | Check the KB before the web | conversational |
| 4 | Judge and argue source quality | conversational |
| 5 | Preview and propose artifacts from a source | batch, per-source |
| 6 | Detect gaps and missing prerequisites | batch, whole-KB |
| 7 | Enrich artifacts — summaries, tags | batch, per-artifact |
| 8 | Propose, type, and justify links | batch, per-pair |
| 9 | Propose concept assignment | batch, per-import |
| 10 | Draft concept map-of-content overviews | batch, per-concept |
| 11 | Generate recall prompts | batch, per-artifact |
| 12 | Answer grounded "ask my knowledge base" questions | conversational |
| 13 | Contradiction detection ◇ | batch, per-pair |
| 14 | Staleness re-checks ◇ | scheduled |

Tensions the design pass has to resolve — worth naming now, not solving now:

- **One agent or several.** Research, ingestion, linking, and tutoring have different instructions,
  different model tiers, and different failure modes. `search_web` is already a sub-agent for a
  mechanical reason; the rest is an open question.
- **Conversational vs. batch is the real fault line.** Most of the list is *not* chat — per-pair
  and per-artifact work cannot sit inside a chat turn at acceptable latency or cost. The chat
  probably *dispatches* these rather than performing them.
- **Where determinism ends.** Fetching, segmenting, retrieval, and rank fusion should stay plain
  code — cheaper, testable, debuggable. The agent should be spending tokens only on judgement.
- **State across turns.** A preview has to survive from proposal through curation to commit;
  sessions are not stateless.

## The linker

**Runs at import, inside the preview, before commit.** Its output is *proposals* the user prunes
in connection review — not edges that appear behind your back. The same pass re-runs later as the
graph grows, which is what makes linking retroactive.

**Owned by the agent** *(decided 2026-07-24)*, exposed as `propose_links`. The retrieval and
fusion stages are deterministic code; the agent calls them, does the typing and justification,
and can reason about the result — noticing that a proposed edge is really a prerequisite chain,
or that the import belongs in an existing concept. Deterministic where determinism is cheaper,
agent where judgement is required.

It considers two candidate populations, and both matter:

- **new × existing KB** — what makes the knowledge base compound.
- **new × new** — what stops a 34-artifact import landing as 34 orphans.

```
                  ┌─ structural   (free, exact)
new + KB ─▶ signals┤─ shared source                ┌─ user prunes ─┐
                  │─ lexical (BM25)  ─▶ RRF ─▶ LLM types + scores ─▶ Relation rows
                  └─ dense embedding                              (origin: AI, confidence, note)
```

### Why not cosine similarity alone

Similarity is the right *family* of signal but the wrong *only* signal, for a specific reason:
**cosine distance measures textual likeness, not relatedness.** The two come apart exactly where
Atlas cares most — `PREREQUISITE` edges typically join artifacts that read nothing alike
("what a vector is" → "attention"; "eigenvectors" → "PCA"), while near-duplicate overviews of the
same topic score highest and are the least useful thing to link. A similarity-only proposer
therefore over-produces `SEE_ALSO` and under-produces the one relation type that powers the
learning path.

So: **generate candidates from several signals with complementary failure modes, and fuse by
rank.**

| Signal | Catches | Cost |
|---|---|---|
| **Structural** | Heading hierarchy → `PART_OF`; internal links → `SEE_ALSO`. The segmenter *already computes these* — within an import they are known facts, not inferences. | Free |
| **Shared sources** | Two artifacts citing the same source are related. `Source` rows already exist. A poor-man's citation graph. | Free |
| **Lexical (BM25)** | Rare technical terms, identifiers, acronyms — exactly what embeddings smooth away. | Cheap |
| **Dense embeddings** | Topical relatedness with no shared vocabulary. What you proposed; keep it. | Cheap (ANN) |
| **Graph topology** | Common neighbours / Adamic-Adar once edges exist — free signal that *improves as the graph grows*. Cold-start useless. | Free |

Fuse with **Reciprocal Rank Fusion** — `score(d) = Σ 1/(k + rank(d))`, k=60. It operates on
ranks, not scores, which sidesteps the fact that BM25 is unbounded and cosine is [-1,1];
[it needs no tuning and is the default fusion in Elasticsearch and Qdrant](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026).
The same machinery is wanted later for HybridRAG search — build it once.

**Optional middle stage:** a cross-encoder reranker scores a *pair* jointly instead of comparing
two independent vectors, catching fine-grained relationships embedding proximity misses. Worth it
only if LLM typing proves too expensive to run on the fused top-N; otherwise the LLM *is* the
reranker.

### Embedding model choice

**Decided 2026-07-24: one general-purpose embedding model (Gemini), shared with the agent.** It
keeps the system on a single model provider with no extra serving infrastructure, and the corpus
is documentation- and tutorial-heavy.

*On record for later:* citation-trained embeddings like
[SPECTER2](https://huggingface.co/allenai/specter2) optimise for *"would this document cite that
one?"* rather than *"are these texts alike?"* — an objective much closer to what an edge in Atlas
means. It is tuned for scientific papers over title+abstract, which is why it loses here today.
Revisit if the knowledge base ever becomes paper-heavy.

**Dimension confirmed 2026-07-24: 1536.** `gemini-embedding-001` serves 768, 1536 and 3072 via
Matryoshka truncation, so the reserved `vector(1536)` column stands and no migration is needed.
Truncated vectors are renormalised before comparison, as truncation does not preserve unit length.
Each run also backfills a bounded slice of unembedded artifacts: the dense signal only reaches a
pair once *both* sides have a vector, so a base predating the linker would stay invisible to it.

### Properties it must keep

- **Generous by default, because a human prunes.** Recall is unrecoverable at review time;
  precision is one click. This inverts the moment any edge lands without review — so if an
  auto-accept threshold ever ships, it gets the conservative treatment, not this path.
- **Bounded cost.** Candidate generation is cheap and can be liberal; **LLM typing scales with
  pairs (n × k)**, so a 200-artifact docs site is ~20k intra-import pairs unbounded. Cap what
  reaches the model, not what reaches the ranker. Batch the typing calls.
- **Reversible.** `origin: AI` + confidence on every machine-made edge, so a bad linker run is one
  `DELETE` away rather than a manual cleanup.
- **Convergent, not ratcheting** *(learned in build, 2026-07-24)*. Verdicts are recorded in
  `judged_pairs`, including the declines. Without that, every rerun re-judges the pairs it
  previously turned down and rolls again — so repeated runs walk the graph towards
  everything-related-to-everything, which is the exact failure this design set out to avoid.
  Remembering the verdict makes a rerun on an unchanged base a no-op, and stops paying to
  re-judge the same pair.

Belongs beside the pipeline in the Python service: same DB, same model client, same job queue.

## Data model

Renames (an Alembic migration, once the consolidation above lands — `Collection`/`Entry` are
stale names for what these now are):

- `Entry` → **`Artifact`**, plus `format: MD | HTML | PDF` and an optional `assetId` for PDFs.
  `body`/`bodyHtml` already exist; PDF needs bytes on disk and a page-count.
- `Collection` → **`Concept`**, plus an `overview` body — the map-of-content page that makes a
  concept readable rather than merely openable.
- `Relation`, `Source`, `Asset` keep their shape. `Source` is the provenance spine and gets more
  important, not less, now that a machine chooses candidates.

New:

- **`User`** — and a `userId` on every owned row. This is the invasive part; do it first, before
  there is more surface to retrofit.
- **`Conversation` / `Message`** — research sessions are worth keeping. The chat is how the
  artifact came to exist, and "why is this in my knowledge base?" is a question worth answering.
- **`Preview`** — pending imports awaiting curation (or keep in the job store; decide when built).

Provenance rule from the vision, enforced in schema: anything the AI created — artifact,
summary, edge — carries `origin: AI` and a confidence, so it is distinguishable from your own
work and prunable in one query.

## RBAC and storage

**Decided 2026-07-24: self-hosted with accounts** — not multi-tenant SaaS. Atlas runs on your own
machine or server via `docker-compose`; accounts and quotas exist, but the operator owns the
install. Consequence: **Vertex/Gemini credentials are per-install, not per-user**, secrets stay in
the environment, and there is no tenant-isolation or per-tenant cost-control problem to solve.

**An honest reframing.** What "RBAC" means for a single-owner knowledge base today is
**authentication + row ownership + quota**. A real role matrix (viewer/editor/admin on shared
concepts) only earns its complexity once sharing exists, which the vision explicitly defers.

So: build auth and ownership now, and define the role enum so sharing can land later without a
second migration — but **do not build the permission matrix yet**. Ownership checks belong in
one place (a scoped data-access layer), not sprinkled through route handlers, or they will be
forgotten exactly once and that will be the leak.

**The 500 MB quota** needs three decisions made deliberately:

1. **What counts** *(decided 2026-07-24)*: stored asset bytes plus artifact text (body and
   summary, UTF-8). Assets dominate today, but an agent that writes artifacts makes text the
   part that actually grows — so it is charged from the start rather than retrofitted.
   **Re-imports charge only the delta**, never the full size again; otherwise re-importing the
   same documentation site would drain a quota without adding any knowledge, and pruned
   sections give their bytes back.
2. **Where it's enforced.** At `commit_artifacts` and at upload — *before* work is done, with the
   projected size shown during curation ("this source adds 4.2 MB"). Failing after a long
   ingest is the worst version of this feature.
3. **How it's counted.** A denormalized `storageBytes` counter on `User`, updated in the same
   transaction as the write. A `SUM` over assets per request will not age well.

Over-quota must degrade honestly: block new imports, never silently drop or truncate content.

## Open questions

Flagged rather than guessed — several of these change the build meaningfully.

- **Agent hosting.** In-process with the pipeline (recommended, simplest) vs. Vertex AI Agent
  Engine (managed, but the pipeline tool then needs to be reachable from it — which forfeits
  the in-process advantage above).
- **PDF artifacts.** Is a PDF artifact rendered as a PDF, or extracted to markdown at ingest and
  the PDF kept as provenance? The pipeline already extracts via docling; storing both doubles
  the quota cost.
- ~~**Concept assignment.**~~ **Settled 2026-08-15:** the agent proposes, the user overrides
  at commit — per source, not per artifact (see the preview/commit split above). Per-artifact
  reassignment stays a post-hoc edit on the artifact page.
- **ADK specifics** — the user has said this description is deliberately vague and will be
  pinned down later. Nothing here should be treated as settled beyond the tool topology.
