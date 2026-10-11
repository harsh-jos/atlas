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
or make unexplored concepts look like a backlog. Concept connections support requires and related to. A saved explanation belongs to the concept it explains.

## Build first

- [ ] Topic conversation: choose a useful starting question from the learner's topic and context.
- [ ] Focused explanation: clear language, a concrete example, and reliable source links.
- [ ] Follow-up guidance: clarification, prerequisite detours, and optional next steps.
- [ ] Saved sessions: close and reopen a conversation without losing it.
- [ ] Small concept graph: show the current idea, prerequisites, and related ideas.
- [ ] Usage controls: enforce model-call, search-request and session-cost limits;
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
scheduled study, gamification, and collaboration from v0.1.
Portability and continuity are required; permanent operation of a hosted service is not promised.

## Current state

This is the target, not a claim that v0.1 is complete. Chat history, the reader, search,
editing, auth, storage, and an artifact graph remain as foundations. The first agent build
uses Gemini 3.8 Flash on Vertex AI, with high reasoning and focused teaching instructions.
It has a bounded research tool, source links, persistent request accounting, and explicit
incomplete replies when limits are reached. Scripted ADK checks cover history, ownership,
research, failure, and request limits. Live PyTorch scenarios have been reviewed for teaching quality; see the dated evaluation notes.

Limits apply to model requests, grounded research requests, input request size,
and reply time. Google may run multiple queries within one research request. Provider-reported
token and query counts are recorded; missing usage is marked unknown. An estimated session
spending guard now blocks further calls at the allowance or while any prior request has pending
or unknown cost. It includes reasoning tokens and reported search queries. The last in-flight
request can overrun the allowance; this is not a hard currency spending limit. Strict currency
enforcement remains required before v0.1. Chat uses HTTP submission and active-turn polling.
Accepted turns, status, progress, and replies are persisted. Browser navigation does not cancel
work; queued turns survive restart. Interrupted running turns are reported without automatic
replay. Explicit Stop cancels queued turns or signals running execution, preserving partial
replies and saved work. Mid-generation continuation is not implemented.
The agent can inspect concept neighbourhoods, remember explored concepts, connect them, and
save/read/revise Markdown explanations. Saves reuse the same concept/title; revisions check
that the saved text has not changed. Existing readers and editors support inspection and deletion.
Concept pages show removable connections; the graph shows concepts and explanations together.
The full graph still opens as a wider map; a neighbourhood-first graph view remains pending.
The rewritten guide separates teaching, platform, and evidence contracts. Bounded conversation
notes support continuity without mastery claims. Owner-level memory and saving preferences
persist across chats; tools block opted-out memory writes and require a request declaration
or saving agreement for explanations. Inspected connections can be removed on request.
See [the agent and tool guide](agent-guide.md) for contracts and verification limits.
Formal language validation and independent semantic consent verification are not implemented.
Keep feature boxes unchecked until their full behaviour has been verified.
Archived experiments are reference code only and are excluded from the active app.

The model and web research choice is Google ADK with Gemini 3.8 Flash on Vertex AI.
No application output-token ceiling is set. Concision comes from teaching scope and language.
Provider truncation is still reported; usage accounting still records output tokens.

## Status review and current UI work — 11 October 2026

The user requested a light-only UI rebuild with a sky-blue accent on a new branch.
This explicitly expands the earlier UI scope. See [the commit-backed status review](status-2026-10-11.md)
for yesterday's implementation evidence, verification limits, remaining release work,
and the UI changes and checks from this session. Feature boxes remain conservative.
