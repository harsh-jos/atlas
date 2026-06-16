# Atlas Vision Handoff (June 16, 2026)

## Purpose
This document captures the current product vision discussion so it can be resumed in a new session without losing context.

## Session Intent
The goal of this phase is not coding. The goal is clarity:
- Define what Atlas should fundamentally be.
- Avoid accidental feature creep.
- Spend time on psychology, UX taste, and long-term personal fit.

## Current Emotional/Strategic Context
- You started the POC without a clear end goal.
- You are fully willing to discard current implementation if it does not match the right vision.
- You care more about building a long-term intellectual home than shipping quickly.
- You want one place to reduce context switching across notes/tutorial/docs platforms.
- Coding is cheap; your time should go into product thinking and calibration.

## Core Vision (Current Best Articulation)
Atlas is your long-term knowledge home:
- A place you return to repeatedly for reading and learning.
- Built around a knowledge-base-first experience.
- Supports both structured and messy knowledge.
- Does not force rigid organization.
- Prioritizes content quality and reading experience over feature count.

## Product Shape (High Confidence)
Atlas has two distinct modules in one app:

1. Knowledge Base
- Main module for imported and curated learning content.
- Sources include PDFs, web pages, docs, and video transcripts.
- May contain both well-structured collections and random standalone topics.
- Randomness is acceptable; graph/collections are optional aids, not strict requirements.

2. Personal Notes
- Separate private space for self-talk and personal thinking.
- Replaces your notes app behavior.
- Must remain a separate entity from the Knowledge Base by design.

## Locked Decisions
These are already decided:

1. Home experience
- First screen should feel like a library shelf.

2. Module separation
- Personal Notes is separate from Knowledge Base.

3. Notes-to-KB boundary
- Relationship type is "Link only".
- Notes can reference KB entries.
- Notes are not promoted into KB content.

4. Search behavior
- Unified search by default across modules.
- Results should clearly indicate whether each result is from KB or Personal Notes.

5. Ingestion storage policy
- Store both original source and cleaned version.
- Reader shows cleaned version by default.
- Source provenance should remain visible and accessible.

## Important Open Question (Paused for Research)
How graph edges should be created:
- Manual only
- AI-suggested with human confirmation
- Fully automatic with edits

Status: intentionally undecided.

## Additional Open Questions to Resolve Later
These were not finalized and should be revisited in a future session:

1. Graph prominence
- Is graph secondary navigation or a primary daily surface?

2. Knowledge linking policy
- Should every KB entry require at least one explicit relation?

3. Personal Notes graph behavior
- Should notes ever appear as hidden/private graph nodes for your own view?
- Current inclination suggests "no", but not explicitly locked.

4. Search controls
- Unified by default is locked.
- Need decision on filtering UX (quick chips, tabs, advanced filters, ranking behavior).

5. Cleaning pipeline strategy
- How aggressive should content cleaning/summarization be?
- How to preserve fidelity when source formatting is complex?

6. Auth/RBAC model
- You want simple login + RBAC because you may demo to peers.
- You mentioned "no hashed password" for easy DB recovery.
- This is a major security tradeoff and should be explicitly revisited before implementation.

## Your Stated Priorities
Priority order inferred from discussion:

1. Return behavior
- You must want to come back often.

2. Reading experience
- Comfortable, high-quality, focused reading UX matters more than dashboards.

3. Ingestion quality
- Importing and presenting valuable knowledge is core USP.

4. Knowledge quality over app features
- The value should come from what is inside Atlas.

5. Minimalism
- Fewer, stronger features.
- Avoid rarely used feature bloat.

6. Flexible structure
- Structure is allowed but never mandatory.

7. Personal fit and taste
- Product should feel like "home", not a generic productivity tool.

## Knowledge Philosophy Captured
- Knowledge can be random and disconnected.
- If topics connect, great; if not, still valid.
- Some collections may be deeply structured (for example, official documentation topics).
- Some collections may be loose and mixed (for example, mental models, insight articles).
- The app must support both modes equally well.

## UX Direction Captured (High-Level)
- Library-shelf first impression.
- Knowledge-base concept as center.
- Low-friction return loop.
- Calm, modern UX direction (details deferred for research).
- "Artifact-like" quality of output/presentation is admired and should inspire experience quality, without cloning other products.

## What Should Likely Stay Out of Scope Early
Not formally locked, but strongly implied:
- Feature-heavy gamification.
- Complex productivity mechanics that create checklist pressure.
- Overly rigid taxonomy systems.
- Building parity with every notes/PKM platform feature.

## Current POC Status (Potentially Disposable)
The repo currently contains a substantial Next.js/Prisma prototype with:
- Collections, entries, graph view, search, inline editor, sources, relations, and schema groundwork.
- This implementation is considered non-binding.
- You explicitly stated willingness to discard it if vision requires.

Practical implication:
- Treat current codebase as reference material, not product truth.
- Vision should drive a fresh architecture and UX decisions.

## Draft North Star Statement
"Atlas exists to keep all valuable knowledge I want to learn and revisit in one place, with a superior reading experience, without forcing rigid structure."

## Draft Product Promise
"One home for learning and thinking: a knowledge library plus private personal notes, connected by choice, not by force."

## Current Dilemmas (Explicit)
1. You are deeply motivated but do not want premature hard choices.
2. You want freedom and mess, but still need enough structure to avoid chaos.
3. You want peer-facing access controls, but also simplicity in operations.
4. You admire graph and GraphRAG possibilities, but do not want to build gimmicks.

## Recommended Next-Session Agenda
Use this exact order in the next session:

1. Lock graph edge creation policy.
2. Lock Personal Notes graph/search visibility rules in detail.
3. Define ingestion pipeline stages from source capture to cleaned reader output.
4. Define the minimum lovable daily loop:
- "I open Atlas -> I do X in 2 minutes -> I feel Y -> I return tomorrow."
5. Decide security baseline for auth/password handling before any implementation.
6. Create v1 scope contract (must-have, nice-to-have, explicit no).

## Resume Prompt for New Session
Paste this in the next session:

"Use this handoff as source of truth. Help me finalize unresolved architecture decisions without overcomplicating the product. Prioritize return behavior, reading experience, and ingestion quality over feature count."

