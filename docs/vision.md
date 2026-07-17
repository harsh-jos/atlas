# Atlas — vision & direction

> **About this doc:** the single source of truth for *what Atlas is and why*. Product identity,
> the learning-science foundation, design direction, and the roadmap. When code and this doc
> disagree about intent, this doc wins — update it deliberately, don't let it drift.
> Design mechanics live in [design.md](./design.md); the research behind the learning claims
> lives in [learning-science.md](./learning-science.md).

## North star

> **Atlas is a calm, graph-native learning home. You arrive with a link or a PDF *to learn the
> concept from Atlas itself*; it weaves what you read into a knowledge graph, and resurfaces
> what's worth revisiting — with hybrid search underneath so you can always find, and
> eventually *ask*, your own knowledge.**

## The reframe that anchors everything

Atlas is a **learning surface, not a storage bin.** You are not capturing already-learned
material for safekeeping — you come here *to do the learning*. The reading and comprehension
experience **is** the product. Graph, RAG, and resurfacing are in service of that, not the point.

Consequence: the **reading/learning experience outranks the AI/graph intelligence** in priority.
A beautiful reader plus one science-backed retrieval mechanic beats a pile of clever features.

## Product identity — locked decisions

- **Daily loop = discover & resurface.** The home is a calm surface that offers something worth
  re-reading or a new connection — serendipity, not obligation. No streaks, no due-counts, no
  cockpit. (See the resurfacing science below — we resurface *retrieval prompts*, not re-reads.)
- **Local-first, Dockerized.** One `docker-compose` brings up the whole stack (Next.js, Postgres
  + pgvector, the Python pipeline, asset storage). Neon is dropped. Runs on your machine first;
  deployment is a later concern.
- **Graph engine: Postgres-first.** HybridRAG rides on `tsvector` + `pgvector` + recursive-CTE
  traversal of the existing `Relation` table. A dedicated graph engine (Apache AGE or Neo4j) is a
  deliberate *later* learning milestone, not a day-one dependency.
- **AI auto-linking: automatic, but labelled.** AI may create edges directly, but every AI edge
  carries `origin: AI` + a confidence score so it is distinguishable from hand-drawn edges and
  **bulk-prunable in one query**. Automatic-but-reversible, never automatic-but-silent.

## The learning-science foundation

Full citations with verified links: [learning-science.md](./learning-science.md). The load-bearing
findings for Atlas:

- **Reading alone produces the *feeling* of learning, not learning.** The fluency illusion
  (Kornell & Bjork) plus Dunlosky's review — which rates rereading/highlighting **low** utility —
  plus Matuschak's *Why books don't work*. A gorgeous reader, by itself, optimises the wrong thing.
- **The fix is the *mnemonic medium*** (Matuschak & Nielsen, *Quantum Country*): embed lightweight
  retrieval prompts *into* the reading, and resurface them on an expanding spaced schedule. This
  unifies our "discover & resurface" choice with the evidence — **resurface a question (retrieval),
  never a re-display (rereading).**
- **Only two techniques are high-utility** (Dunlosky 2013): **practice testing** and **distributed
  practice**. So Atlas needs essentially **one learning mechanic done beautifully** — embedded
  recall prompts on a spaced schedule (FSRS) — and everything else is reading-experience polish.
  This validates the "few features, premium execution" instinct.

Design instincts, each backed by evidence:

| Instinct | The science | Atlas feature |
|---|---|---|
| Minimal, low-chrome, calm | Cognitive Load Theory (Sweller); Coherence (Mayer) | Single-column reading, no dashboards in the reading flow |
| Obsess over typography/hierarchy | Signalling (Lorch; Mautone & Mayer) | The custom renderer is a *comprehension tool*, built seriously |
| Support images/diagrams | Dual coding (Paivio); spatial contiguity (Mayer) | Figures placed *next to* the prose they explain |
| Great on phone & laptop, no rush | Screen penalty worst under time pressure (Delgado) | Self-paced, no timers, generous measure |
| "Learn the concept *from* Atlas" | Fluency illusion (Kornell/Bjork); mnemonic medium | Inline recall prompts + spaced resurfacing |
| Paraphrase, don't hoard | Generation effect (Slamecka); note-taking replications | "In your own words" prompt; nudge summaries over verbatim |

## Design direction (read from the inspiration references)

Full detail and the annotated reference library live in [design.md](./design.md); the inspiration
shots are in `docs/design-taste/` (local-only, gitignored). The taste, read from the screenshots:

- **Quiet-luxury editorial — one calm mood everywhere**, in the register of a premium AI-research
  journal. Light warm-grey canvas, white cards floating under soft low shadows, hairline borders,
  16–20px radii, generous whitespace. Calm and confident, not minimal-anemic, and **not** playful.
- **A three-voice type system:** an **editorial serif** for display/titles (the "premium journal"
  gravitas — the biggest evolution from the stale doc), a **neutral grotesk** for UI/labels, and
  **monospace** as a technical accent (micro-labels, tags, keyboard hints, code). Lean toward a
  serif reading face for long-form bodies to match the book-like philosophy.
- **Near-monochrome with meaningful colour:** one blue-violet brand accent (used for links, focus,
  brand, and *art* — not button fills), plus a soft semantic status system (green/amber/blue pills).
  **Carbon/black primary buttons, white-outline secondary.**
- **Signature motifs:** generative blue-violet data-viz art (particle clouds / point fields) — the
  natural language for Atlas's **knowledge graph** and hero moments — and faint halftone/dot-matrix
  texture. Motion is subtle and premium; never celebratory.

**Correction on file:** the `ml_flashcards.html` in the taste folder is **not** the user's taste —
its gradients, colour pills, confetti, and gamified feel are explicitly rejected. The learning
mechanic (a retrieval prompt: question → answer → self-graded recall) is still core, but it must be
rendered in Atlas's calm editorial style, not as a playful flashcard.

## Roadmap

Each phase ships something usable. Order reflects the reframe: reading + one retrieval mechanic
come before the AI/graph intelligence.

0. **Dockerize, go local-first.** `docker-compose` for Next.js + Postgres(pgvector) + Python
   pipeline + an asset volume. Drop Neon. Pure unblock, no new features.
1. **The premium reading experience.** The distinctive markdown/HTML renderer, images with proper
   placement, mobile-perfect reading. Reading stays on **Inter** for now, but build the reading
   typography as a swappable token — a reading-font switcher in settings comes later.
   *Top priority — this is the product.*
2. **The mnemonic loop.** Inline recall prompts + FSRS-based spaced resurfacing feeding the
   "Discover" home. Small, and it is what makes Atlas *work*.
3. **Embeddings + automatic connection detection.** Populate the reserved `vector(1536)` column;
   propose edges via cosine similarity, optionally type them with an LLM. AI edges labelled + scored.
4. **HybridRAG.** Fuse keyword + vector + graph traversal with Reciprocal Rank Fusion.
5. **Graph engine + GraphRAG (later, deliberate).** Apache AGE or Neo4j as a learning milestone,
   then conversational "ask my knowledge."

The **beautiful renderer** is not a phase — it is a thread through all UI work.

## What exists today (starting point)

A clean, working Next.js 16 + Prisma + Postgres app: library of `Collection`s → `Entry`s (markdown
body, tags, JSON metadata, a reserved-but-empty embedding column), typed `Relation` edges, `Source`
provenance, full-text search, a `react-force-graph-2d` explorer, and a deterministic Python
ingestion pipeline (URLs/docs-sites/articles/PDFs/markdown → segmented, linked entries). The code
is well-structured — we evolve it toward this vision; we do not rewrite it.
