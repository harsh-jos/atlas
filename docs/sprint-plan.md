# Atlas Sprint Plan (Session Handoff Friendly)
*Last updated: June 17, 2026*

## Why this file exists
Use this file as the default context in any new session during this sprint.
It is intentionally simple: what to build next, in what order, and what to avoid.

## Source of truth
- Vision: [vision-handoff-2026-06-16.md](/Users/harsh/Documents/Projects/atlas/docs/vision-handoff-2026-06-16.md)
- This sprint plan: [sprint-plan.md](/Users/harsh/Documents/Projects/atlas/docs/sprint-plan.md)

## Locked decisions (do not reopen this sprint)
1. Home is a library shelf.
2. Two modules: Knowledge Base and Personal Notes.
3. Personal Notes -> Knowledge Base is link-only.
4. Search is unified by default, with clear module labels.
5. Ingestion stores both original and cleaned content.
6. Graph exists, but is secondary.

## Sprint objective
Ship a reader-first experience and import the first real content set:
- Python
- Google ADK
- Marcus Aurelius

Do this before deep pipeline or graph decisions.

## Step-by-step plan

### Step 1: Reader-first UI pass
Goal: make opening and reading content feel calm and addictive.

Tasks:
- [x] Simplify home as a true "library shelf" surface.
- [x] Refine entry reader for long-form reading comfort.
- [x] Keep metadata ambient (visible, not noisy).
- [x] Add clear "View source/original" access.

Session prompt:
> Use `docs/vision-handoff-2026-06-16.md` and `docs/sprint-plan.md` as source of truth. Work only on reader-first UI and shelf UX. Do not add new features.

---

### Step 2: Module boundary enforcement
Goal: make Knowledge Base and Personal Notes clearly separate.

Tasks:
- [x] Ensure Personal Notes is a separate navigation/module.
- [x] Ensure notes cannot be promoted into KB entries.
- [x] Allow link-only references from notes to KB.
- [x] Keep note-to-KB behavior explicit in UI copy.

Session prompt:
> Continue sprint work with strict module boundaries: Personal Notes is separate, link-only to KB, never promoted. Keep implementation minimal.

---

### Step 3: Unified search with clear source labels
Goal: one search entry point, zero confusion.

Tasks:
- [x] Keep single search box across app.
- [x] Show results from both modules in one list.
- [x] Label each result clearly (`Knowledge Base` or `Personal Notes`).
- [x] Keep ranking/facets simple for now.

Session prompt:
> Implement unified search defaults with clear module labeling only. Skip advanced filtering and complex ranking.

---

### Step 4: Real content import (manual/semi-manual)
Goal: learn ingestion requirements from real use, not assumptions.

Tasks:
- [ ] Import initial Python content.
- [ ] Import initial Google ADK content.
- [ ] Import initial Marcus Aurelius content.
- [ ] Store both original + cleaned versions.
- [ ] Verify cleaned reading view quality.

Session prompt:
> Focus on importing the first three topics manually or semi-manually. Do not design a full ingestion pipeline yet.

---

### Step 5: Friction log (defines future ingestion pipeline)
Goal: capture pain points that should become pipeline requirements.

For each import, record:
- [ ] What was slow?
- [ ] What broke formatting?
- [ ] What required manual cleanup?
- [ ] What should become automated later?

Keep notes here (append as you work):

#### Import friction notes
- Date:
  - Source:
  - Pain:
  - Temporary workaround:
  - Future pipeline requirement:

## Session log
- 2026-06-17:
  - Created branch `sprint/reader-first-pass`.
  - Added `Note` + `NoteLink` models and Notes module routes/UI.
  - Added unified search across KB and Personal Notes with clear labels.
  - Updated home to library-shelf framing and surfaced Personal Notes.
  - Added `Entry.originalBody` plus reader access to original imported text.
  - Seeded starter topic content for Python, Google ADK, and Marcus Aurelius.

## Out of scope for this sprint
- Graph edge automation policy
- Advanced graph behaviors
- Advanced search filters and ranking systems
- Auth/RBAC implementation
- Large architecture rewrites
- Feature parity with other PKM tools

## Done criteria for this sprint
This sprint is successful when:
1. Reader UX feels clearly better than current POC.
2. Module boundaries are enforced in product behavior.
3. Unified search works with clear source labels.
4. Initial real content exists for the 3 target topics.
5. Friction log is filled enough to design ingestion v1 next sprint.

## One-line resume prompt (quick copy)
> Continue Atlas sprint using `docs/vision-handoff-2026-06-16.md` and `docs/sprint-plan.md`. Focus only on reader-first UX, module boundaries, unified search labels, and manual import of Python/Google ADK/Marcus Aurelius with friction logging.
