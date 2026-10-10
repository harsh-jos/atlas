# Atlas: purpose and v0.1

Atlas helps you explore a subject with expert guidance. It remembers what you explored
and shows how ideas connect. You choose the direction, depth, and when to stop.
Start with curious technical learners, using Python and PyTorch as the first real cases.

## Agent behaviour

- Use the judgement of a careful subject expert. Select what matters and explain why.
  Do not claim personal experience or assume the learner wants mastery.
- Ask about purpose and prior knowledge only when needed. Start with one useful question.
- Explain one idea at a time with concrete examples. Offer prerequisites and accept detours.
- Use ASD-STE100 Simplified Technical English. Explain necessary terms and use them consistently.
- Use web evidence and source links. State uncertainty. Never invent facts or sources.
- Remember prior exploration without treating reading as proof of understanding.
- Suggest optional next steps. Do not impose a course, deadline, or completion target.
- Save session history automatically. Create durable explanations by explicit or agreed action.
  Allow inspection, revision, and deletion. Individual graph-edge review is optional.

## Product shape

The loop is: ask → explore one question → keep what matters → see connections → return.
A session need not produce a document. A saved explanation should answer one meaningful
question and remain useful without its chat. Small means focused, not a fixed word count.

The graph provides orientation and guides the agent. Target two node types: concepts and
saved explanations. Start with three relationships: requires, related to, and explains.
Show the current neighbourhood first, with a wider view available. Do not show mastery scores
or make unexplored concepts look like a backlog. The current schema needs work to support this.

## Build first

- [ ] Topic conversation: choose a useful starting question from the learner's topic and context.
- [ ] Focused explanation: clear language, a concrete example, and reliable source links.
- [ ] Follow-up guidance: clarification, prerequisite detours, and optional next steps.
- [ ] Saved sessions: close and reopen a conversation without losing it.
- [ ] Small concept graph: show the current idea, prerequisites, and related ideas.
- [ ] Usage controls: enforce model-call, search-request, output, and session-cost limits;
      record use and report incomplete work when a limit is reached.

## Also required before v0.1

- [ ] Return guidance: resume after a gap without starting again or creating pressure.
- [ ] Durable explanations: save, read, revise, and delete them.
- [ ] Agent access: retrieve saved content and create or revise explanations and connections.
- [ ] Graph navigation: select a concept, open its explanations, or ask about it.
- [ ] Optional predictions and small exercises, with feedback.
- [ ] Export saved content and connections; back up data and verify recovery.
- [ ] Private deployment with access control.
- [ ] Behaviour checks for accuracy, simple language, scope, guidance, and budget handling.

Release test: explore a real PyTorch question, understand something useful, follow a
connection, stop, and return later without starting again.

## Boundaries and technical choices

Keep this repo. Use Google ADK in the Python backend and Next.js for the interface.
Keep the UI simple and readable. Define and enforce budgets in code, not only in prompts.
Choose budget amounts and hosting after the first learning loop works.

Exclude bulk imports, whole-book generation, PDF processing, advanced automatic linking,
scheduled study, gamification, collaboration, and a UI redesign from v0.1.
Portability and continuity are required; permanent operation of a hosted service is not promised.

## Current state

This is the target, not a claim that v0.1 is complete. Chat history, the reader, search,
editing, auth, storage, and an artifact graph remain as reusable foundations. The agent has
search tools and initial instructions. Budget enforcement, the new concept graph, agent writes,
and behaviour validation still need implementation. All boxes remain unchecked until verified.
Archived experiments are reference code only and are excluded from the active app.
