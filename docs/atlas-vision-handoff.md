# Atlas — Vision Handoff
*Last updated: June 16, 2026*

---

## North Star

> "Atlas is a personal knowledge home — a library of things I want to learn and revisit, with a reading experience good enough to keep coming back to."

This is not a productivity tool. It is not a PKM showcase. It is not a second brain to demonstrate to others. It is a private intellectual home built for the act of learning, not the appearance of it.

---

## The Core Insight (Do Not Lose This)

The original POC failed emotionally because it felt like a **showcase** — a place to display what is already known, optimized for presentation and graph aesthetics.

Atlas must be the opposite: **inward-facing**. Built for the reader, not the viewer.

| Showcase App | Learning Home |
|---|---|
| Optimizes for how a collection looks | Optimizes for how easy it is to open and read |
| Structure is visible and prominent | Structure gets out of the way |
| Feels finished | Feels alive and growing |
| Outward-facing ("look what I know") | Inward-facing ("help me go deeper") |

Every future design decision should be tested against this distinction.

---

## What Atlas Is

**Two modules. One app.**

### 1. Knowledge Base
The primary module. A library of imported learning content: PDFs, web pages, documentation, video transcripts. Content can be deeply structured (e.g. official docs) or loosely collected (e.g. mental models, insight articles). Both modes are equally valid. Structure is never mandatory.

### 2. Personal Notes
A private space for thinking and self-talk. Separate from the Knowledge Base by design — not a staging area for KB content. Notes can reference KB entries, but are never promoted into KB content. The boundary is intentional and permanent.

---

## Locked Decisions

These are not up for re-evaluation.

| Decision | What is locked |
|---|---|
| Home screen | Feels like a library shelf |
| Module separation | Personal Notes is its own space, not part of KB |
| Notes → KB relationship | Link only. Notes reference KB entries, never become them |
| Search default | Unified across both modules. Results clearly labeled by source |
| Ingestion storage | Store both original and cleaned version. Reader shows clean. Source always accessible |
| Graph view | Present in the app, but secondary. Not a daily surface. Not a primary feature |

---

## Graph: Explicitly Demoted

The graph view was over-weighted in the original POC due to GraphRAG interest at the time. This has been corrected.

**Current position:** Graph is a useful orientation tool once the knowledge base is dense. With sparse content, it is visual noise. It should exist but should never compete for attention with reading and ingestion.

Graph edge creation policy remains undecided (manual / AI-suggested / automatic) but is low priority until content density justifies it.

---

## Immediate Priorities (Current Phase)

These are the only two things that matter right now:

### 1. UI/UX Overhaul
The reading experience needs to become the best thing about the app.

- Reduce friction to zero for opening and reading anything
- Metadata should be present but ambient — visible when needed, never competing for attention
- Calm, clean, modern aesthetic
- No dashboards, no feature-heavy surfaces on the main reading flow

### 2. Real Content
The POC has 3 seed topics. That is not enough to feel like a home. The first real content batch is:

| Topic | Type | Nature |
|---|---|---|
| Python | Technical docs | Structured, hierarchical, reference-style. Non-linear reading |
| Google ADK | Technical docs | Newer, evolving, mix of guides and API reference |
| Marcus Aurelius | Philosophical prose | Linear, reflective, slow reading. Meditations is non-linear by chapter |

These three topics are deliberately varied. They will stress-test reading experience, ingestion handling, and content diversity assumptions. Treat them as a design probe, not just data.

---

## What Is Intentionally Deferred

### Ingestion Pipeline
This cannot be designed from theory. The right pipeline will only become clear after manually importing real content and feeling where the friction is.

Current blocker: inability to define what the pipeline *should and should not do* with confidence. This is fine. Do not force it.

**The path forward:** Import Python, Google ADK, and Marcus Aurelius manually or semi-manually. Experience the friction firsthand. Let that experience define the pipeline requirements.

Notable challenge: these three topics need different treatment —
- Python has a structure worth preserving
- ADK content may be scattered (site, GitHub, YouTube)
- Marcus Aurelius is clean text that needs almost no processing, just good typography

### Open Questions (Low Priority Until Content Exists)

- Graph edge creation policy (manual / AI-suggested / automatic)
- Whether graph is ever a daily surface or always secondary navigation
- Whether every KB entry should require at least one explicit relation
- Search filtering UX (chips, tabs, advanced filters)
- Whether Personal Notes ever appear as private graph nodes
- Cleaning pipeline aggressiveness and fidelity tradeoffs

### Auth / RBAC
Simple login with RBAC is wanted (for occasional peer demos). The "no hashed password" idea is a noted security tradeoff and must be revisited explicitly before any auth implementation. Not a now problem.

---

## What Stays Out of Scope

Not locked, but strongly implied and should be resisted:

- Gamification or streak mechanics
- Checklist or productivity pressure
- Rigid taxonomy or forced categorization
- Feature parity with Notion, Obsidian, or any PKM platform
- Graph as a marketing feature or visual centerpiece

---

## Codebase Status

Existing Next.js / Prisma prototype has: collections, entries, graph view, search, inline editor, sources, relations, schema groundwork.

**Treat as reference material, not product truth.** The implementation is non-binding. The current phase is UI overhaul and content, not architecture changes. Architecture decisions follow once reading experience and real content are in place.

---

## Resume Prompt for Next Session

> "Use this handoff as source of truth. The immediate focus is UI/UX overhaul for reading quality and importing the first three real topics: Python, Google ADK, and Marcus Aurelius. Ingestion pipeline design is deferred until we have hands-on experience importing these. Do not reopen locked decisions."
