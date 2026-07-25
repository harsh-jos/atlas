# Atlas — vision & direction

> **About this doc:** the single source of truth for *what Atlas is and why*. **Rewritten
> 2026-07-24 for a new direction** — the previous vision (a calm library for links and PDFs you
> already decided to read) is gone; git remembers it. Design mechanics live in
> [design.md](./design.md), the research behind the learning claims in
> [learning-science.md](./learning-science.md), and the technical shape in
> [architecture.md](./architecture.md). The full catalog of candidate features — researched
> against the field, and deliberately *unsequenced* — is [features.md](./features.md).
> When code and this doc disagree about intent, this doc wins — update it deliberately, don't
> let it drift.

## North star

> **Atlas is where curiosity becomes a knowledge base you own.**
>
> You arrive with nothing but a question. An agent researches the open web *with* you, proposes
> the sources worth your time, and **you choose** what earns a place. What you keep is ingested
> into durable, linked, beautifully readable artifacts — permanently yours, permanently connected.

## The thesis — why this product should exist

NotebookLM and Obsidian each hold one half of the thing, and neither will cross the gap.

- **NotebookLM** is research and grounded generation: bring sources, get citations, mind maps,
  study guides, quizzes, audio overviews — and, since Deep Research, it will even find its own
  sources. But a notebook is a silo. Sources are session-scoped. Nothing compounds. It is
  brilliant and amnesiac.
- **Obsidian** is durable, owned, linked markdown that compounds for a decade — wikilinks,
  backlinks, graph, properties, Bases as a database lens over plain files. But it never *brings*
  you anything. Every note in it is a note you wrote yourself — and every link is one you drew
  by hand.

> **NotebookLM forgets. Obsidian doesn't research.**
> Atlas is the product that does both: the research power of the first, producing the permanent,
> linked, owned substrate of the second.

**The consequence that governs every decision:** the unit of value is not the conversation — it
is **what is left behind after the conversation.** A chat that ends without durable artifacts in
your graph was a waste of your time. Every agent interaction must terminate in something that
persists, is readable months later, and is connected to what you already knew.

## The core loop

```
curiosity → converse → research → propose → curate → commit → read
```

1. **Curiosity.** You arrive with a question ("I want to understand vector databases"), not a
   link. This is the front door — the chat *is* the home screen.
2. **Converse.** The agent scopes it with you: how deep, what for, what you already know. It
   checks your existing knowledge base before it checks the web.
3. **Research.** It searches the open web and your own graph in parallel.
4. **Propose.** It comes back with candidate sources and, for each, **the exact artifacts that
   source would become** and **the connections they would form** — into what you already know,
   and among themselves. Not a URL and a promise.
5. **Curate.** You prune both: the artifacts you don't want, and the links that don't belong.
   Proposals are deliberately generous, because you are the filter.
6. **Commit.** Only now does anything get written — and artifacts land already connected.
7. **Read.** What you kept is yours to read, linked into everything around it.

**Step 5 is the spine of the product.** Atlas never auto-imports and never auto-links. The
curation moment is what makes the knowledge base *yours* rather than a pile of scraped pages —
it is the single interaction that separates Atlas from "an agent that fills a folder."

## The object model

The system has one primary object and one grouping above it.

- **Artifact** — the atom, and the primary component of the system. One self-contained thing,
  bodied as **markdown, HTML, or PDF**. **Deliberately unconstrained** in length, depth, and
  form: an artifact is free to be a one-line definition, a long explainer, a diagram, or an
  annotated paper. The only guidance is coherence — if it can't be named without "and", it is
  probably two artifacts.
- **Concept** — a group of artifacts that together cover one idea. A concept is **not just a
  folder**: it has its own readable overview page — a map of content the agent drafts and you
  edit — so a concept is something you can *read*, not just something you can *open*.
- **The graph** — typed relations (`PART_OF`, `USES`, `PREREQUISITE`, `CONTRASTS`, `SEE_ALSO`)
  between artifacts and between concepts. Containment gives structure; links give meaning.
  Obsidian's lesson applies: folders are weak, links are strong.

Everything else — search, chat, the graph view — is a lens onto artifacts.

## What we take from the field (and what we refuse)

Researched against NotebookLM, Obsidian, and Notion as they stand in mid-2026.

**Take — these are load-bearing:**

| From | What | Why it matters here |
|---|---|---|
| NotebookLM | **Grounded citations on everything** | An agent that fills your knowledge base is only trustworthy if every claim points at its source. Non-negotiable. |
| NotebookLM | Source-grounded chat ("ask my sources") | Becomes "ask *my knowledge base*" — the payoff for accumulating one. |
| Obsidian | **Wikilinks + backlinks, everywhere** | Compounding value. Every artifact must show what points *at* it. |
| Obsidian | Local-first, portable files, no lock-in | We already write Obsidian vaults. Export stays a first-class exit door. |
| Obsidian | Properties as structured metadata | Already have `metadata` jsonb + tags; make them visible and filterable. |
| Notion | AI autofill of properties | The enricher already does this deterministically — upgrade it with the agent's LLM. |

**Refuse — deliberately out of scope:**

- **Audio/video overviews.** NotebookLM's most-loved feature and still not ours: Atlas is
  reading-first, and a podcast is the fluency illusion with better production values. Revisit
  only if reading is already excellent.
- **Blocks-and-databases as a workspace.** We are not rebuilding Notion. An artifact is a
  document, not a block tree.
- **Real-time collaboration, comments, sharing.** Single-owner knowledge base first.
- **Canvas / freeform whiteboard.** The graph is our spatial surface; one is enough.

## What the learning science still buys us

[learning-science.md](./learning-science.md) survives this pivot intact, and the artifact model
strengthens it. The findings that still bind us:

- **Reading alone produces the *feeling* of learning, not learning** (fluency illusion;
  Dunlosky rates rereading low-utility). An agent that fills a beautiful library faster than
  ever makes this *worse*, not better — more to feel good about, no more learned.
- **Only two techniques are high-utility: practice testing and distributed practice.** Atlas
  does **not** implement either — see the roadmap. This is a deliberate scope decision, not an
  oversight, and it is worth being honest that it leaves the fluency-illusion problem unsolved.

What the science still buys us: it is the reason curation is the spine rather than a convenience,
and the reason provenance is non-negotiable. Choosing what enters your knowledge base is itself
an act of processing; a pile of auto-scraped pages would not be.

## Roadmap

Ordered so each phase ships something usable, and so the riskiest unknown (the agent) is proven
before the expensive surfaces are built on top of it.

0. **Foundations.** Rename the model to Artifact/Concept. Users, auth, ownership on every row,
   per-user storage quota. Everything after this assumes a `userId`.
1. **The agent, end to end.** ADK agent on Vertex/Gemini: converse → web search → propose
   sources → **preview artifacts and their connections** → user curates → commit. Ugly UI is
   acceptable here; proving the loop is the point.
   *Carries a dependency:* connection review is part of the loop, not an add-on, so the
   **retrieval substrate** the linker needs — embeddings, BM25, rank fusion — gets built here
   rather than in phase 5. Phase 5 then only builds *surfaces* on top of it.
2. **The chat home.** The conversation becomes the front door of the app, replacing the library
   grid. This is where UI/UX effort concentrates — it is the first thing anyone sees.
3. **The artifact experience.** The reading surface for md/html/pdf artifacts, backlinks,
   concept overview pages, provenance and citations rendered properly.
4. ~~**The learning layer.**~~ **Dropped 2026-07-24.** Recall prompts and spaced resurfacing are
   not being built. The reading and curation experience is the product; the retrieval-practice
   mechanic is out of scope. [learning-science.md](./learning-science.md) stays on file because
   it still explains *why* curation and provenance matter, but it no longer implies a roadmap item.
5. **Retrieval surfaces.** Hybrid search over the substrate laid in phase 1 (tsvector + pgvector
   + graph traversal, fused), then "ask my knowledge base" grounded chat.
6. **The graph view, redesigned.** Explicitly deferred — the current 3D view needs to change but
   the direction isn't articulated yet. Don't touch it until it is.

## Non-negotiables

- **The user curates.** Nothing enters the knowledge base without an explicit human choice.
- **Everything is grounded.** Every artifact carries provenance; every AI-made claim or edge is
  labelled as such and bulk-reversible.
- **Artifacts are readable objects, not chat logs.** The output of research must survive being
  read six months later by someone who forgot the conversation.
- **The knowledge base is portable.** Markdown out, Obsidian vault out, no lock-in.
- **Reading-first, calm, premium.** The design register in [design.md](./design.md) does not
  change because the product got an agent.
