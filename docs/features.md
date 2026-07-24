# Atlas — what it does

> **About this doc:** the short list of what Atlas actually is, kept deliberately small.
> Atlas is a **few things done beautifully**, not a feature surface. A longer researched catalog
> of everything the field offers once lived here and was cut on purpose — `git log` has it if a
> specific idea is ever wanted.
>
> **The rule for this doc:** adding something means arguing why it belongs, and preferably
> naming what it replaces. A list that only grows is how the product becomes Notion.

## The seven

**1. Research conversation.** You arrive with a question, not a link. The agent scopes it, then
searches the open web *and your existing knowledge base* — so it knows what you already have
before it proposes anything.

**2. Curation before commit.** The agent shows the exact artifacts a source would become, and the
connections they would form. You prune both. Nothing is written until you say so. **This is the
spine of the product** — it is what makes the knowledge base yours rather than a pile of scraped
pages.

**3. Automatic linking.** Edges are neither hand-drawn nor merely backlink-derived. Multi-signal
candidate generation (structural, shared-source, BM25, embeddings, graph topology, fused by rank),
typed and justified by the agent, proposed generously, pruned by you. Re-runs as the graph grows,
so today's import connects to what you learned months ago. *(Mechanics:
[architecture.md](./architecture.md#the-linker).)*

**4. Artifacts and concepts.** An artifact is one self-contained thing — markdown, HTML, or PDF —
unconstrained in length, depth, and form. A concept groups artifacts and has its own readable
overview page, so it is something you can *read*, not just open.

**5. The reading experience.** Already the best part of the app and not to be regressed: single
column, real typography, math, code, images. Plus backlinks and inline citations to source, which
become non-negotiable the moment a machine writes the text.

**6. ~~One learning mechanic.~~** **Dropped 2026-07-24.** Recall prompts and spaced resurfacing
are not being built. Reading and curation are the product. Listed here rather than deleted so the
decision is visible instead of looking like an omission.

**7. Yours to keep.** Provenance on everything: every artifact traceable to its source *and* to
the conversation that created it; every AI-made edge labelled and reversible in one query.
Markdown and Obsidian-vault export, so you can walk away. NotebookLM structurally cannot say this.

## Not doing

Recorded so they don't get re-proposed.

- **Audio / video overviews** — NotebookLM's most-loved feature. Atlas is reading-first, and a
  generated podcast is the fluency illusion with better production values.
- **Notion-style blocks** — an artifact is a document, not a block tree.
- **Freeform canvas** — the graph is already the spatial surface.
- **Collaboration, comments, sharing** — single-owner knowledge base.
- **Gamification** — streaks, XP, badges, confetti. Rejected on taste *and* pedagogy.
- **Plugin ecosystem** — the vault export is the extensibility story.
- **Autonomous background importing** — the user curates. Non-negotiable.

## Deferred by decision

- **The graph view.** Needs to change; the direction isn't articulated yet. Don't touch it until
  it is.
- **Agent design.** Scope is accumulating deliberately; the running inventory and its unresolved
  tensions are in [architecture.md](./architecture.md#accumulating-responsibilities--design-pass-pending).
