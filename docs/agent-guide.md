# Atlas agent: behaviour, tools, and memory

The product contract is [product.md](product.md). The active agent is an expert guide for
one useful question at a time. It chooses a sensible entry, explains a mechanism with a
concrete example, follows detours, and leaves the person free to stop. A chat need not
produce a document. The Atlas skill informed this teaching approach; its HTML artifact
workflow is not part of the application agent.

## Prompt and execution

`backend/app/agent/prompts.py` separates teaching, platform, and research instructions.
Domain-specific counterexamples belong in `backend/tests/agent_scenarios.json`, not in
rules that every topic must carry. User-facing text follows ASD-STE100 principles;
formal dictionary/rule compliance is not automatically verified.

The guide and its focused researcher use the configured Gemini models through Google ADK.
The existing worker, persisted turns, Stop handling, ownership, quotas, revision checks,
and request/spending guards remain in place. There is no additional planning model or
code execution tool. No automatic model retry was added.

At the start of each turn, the backend reads the owner's current preferences from the
application database. The dynamic instruction receives these preferences and a bounded
set of notes from that conversation. This does not need an extra model request.
The notes contain the current question, stated background, unresolved confusion, and
one possible next connection. They contain no private reasoning or mastery assessment.
`update_learning_context` replaces them when the conversation materially changes; it is
not required on every follow-up. Existing chat history is not compacted by this feature.

## Tools available to the guide

| Tool | Contract |
| --- | --- |
| `researcher` | Uses Google Search for one specific question. Returns evidence, assumptions, examples, and URLs. Shares the guide's request/spending limits. |
| `search_knowledge_base` | Searches the owner's saved explanations. A result is evidence of prior exposure, not understanding. |
| `read_saved_explanation` | Reads owned text, sources, reader URL, and revision timestamp. Indicates truncation. Read before revision; do not overwrite a truncated body. |
| `inspect_concept_graph` | Reads recent concepts or a neighbourhood with at most 20 connections and 10 explanations. Records the inspected connection IDs for this invocation. |
| `remember_concept` | Creates or reuses an explored concept. Blocked when concept memory is disabled. |
| `connect_concepts` | Connects existing owned concepts with `requires` or symmetric `related_to`. Reuses duplicates. Blocked when memory is disabled. |
| `remove_concept_connection` | Removes an owned connection after inspection in the current invocation and an explicit request declaration. Does not delete concepts or explanations. |
| `save_explanation` | Saves a standalone Markdown answer and sources. Requires a one-time request declaration or stored saving agreement. Returns a reader link. Duplicate concept/title pairs reuse the existing answer. |
| `revise_saved_explanation` | Revises with the timestamp returned by a read. Requires a request declaration or saving agreement. Rejects stale edits and preserves storage quota accounting. |
| `set_learning_preferences` | Changes only requested preferences across the owner's chats. Omitted fields remain unchanged. Turning memory off clears this conversation's current notes. |
| `update_learning_context` | Replaces this conversation's notes. Question/next connection: at most 500 characters each; background/confusion: at most 1000 each. Blocked when memory is disabled. |

`requires` points from an idea to its prerequisite. `explains` is derived from an
explanation's concept membership, not created by the concept-connection tool.
A connection is orientation, never a mandatory next lesson.

## Preferences and consent

The defaults are `memory_enabled=true` and `auto_save=false`. They are stored on the
owned user record, so new chats and process restarts retain the choices. Every concept
or connection write reads the current database preference under the owner's write lock.
The context tool also checks the database before updating session notes.

A request such as “do not remember concepts or learning notes” disables concept,
connection, and note writes. The injected notes are hidden in other chats while memory
is disabled. Existing records and chat history are not erased. To remove an existing
connection, the person can request the removal even while memory is disabled.

Saving explanations is a separate preference. “Keep this” allows one save; it does not
enable automatic saving. “Save useful explanations automatically” enables the continuing
agreement. Revocation blocks later automatic saves and revisions. Explicit saves and
revisions remain available for existing concepts while concept memory is disabled.
A new concept cannot be created while memory is disabled; the agent must respect that
choice rather than silently override it to save an explanation.

The code rejects a save or revision unless `user_requested=true` or the stored saving
agreement is enabled. Removal requires `user_requested=true` and a previously inspected
connection ID. **The model still interprets the human request and declares consent.**
These checks are not an independent semantic consent verifier. Preference changes are
also interpreted by the model. Do not describe this as a separate human approval system.

Tool failures, including context-length and removal-policy failures, emit durable tool
error events. Writes commit before reporting success. A failed later model request does
not undo an already committed preference change or save.

## Verification and rollout

Apply the new migration through the existing deployment bootstrap before starting the
updated backend: from `backend/`, run `uv run python -m app.db.bootstrap`.
This adds two preference columns with defaults for existing owners. No existing graph,
explanation, or chat data is rewritten. Working notes use the existing ADK session store.

The implementation check on 10 October 2026 passed 182 backend tests with no skips,
including fresh/repeated migrations and schema-drift checks. Ruff, frontend lint,
TypeScript, and diff whitespace checks passed. Scripted ADK runs cover note persistence,
chat isolation, opt-out, blocked memory tools, bounded notes, and removal guards.
PostgreSQL checks cover preference defaults, ownership, consent/revocation, and graph writes.

No live Gemini evaluation was run for the initial harness increment. Scripted responses verify the harness,
not teaching quality. Live scenarios now include memory choices, saving agreements,
and a DNS exploration alongside the existing PyTorch regressions. Use the evaluation
command in the README with a dedicated test account, and inspect persisted effects as
well as the prose. Existing strict-currency-cap and release-checklist gaps remain.

## Prompt caching

The guide's fixed teaching/platform rules use ADK `static_instruction`. The researcher
also uses a static instruction. Preferences and conversation notes use the guide's dynamic
`instruction`, which ADK sends as request content. Tests verify that changing notes leaves
the system instruction unchanged. This prepares stable content for provider implicit
caching; it does not create an explicit cache or guarantee a cache hit.

The usage endpoint exposes `cachedInputTokens`, a subset of `inputTokens`, and
`cacheUnreportedRequests`, the number of requests without reported cache-token metadata.
A provider-reported zero is a known zero. Missing values, pending requests, and historical
rows remain unknown. Do not calculate a session hit rate from incomplete coverage.
Cost estimates still price all input at the standard rate, preserving the conservative
spending guard. Explicit caching remains off; its creation/storage charges and lifecycle
would need separate accounting before enabling it.

[The short live smoke test](evaluations/2026-10-10-cache-smoke.json) returned a three-sentence
Python dictionary explanation in 10 seconds. It used two guide requests and no research
request, with an estimated cost of $0.008252. Both requests omitted cache-token metadata;
this does not establish a hit or miss. Concept and context tools completed without errors,
and the disposable test account was removed. The reply followed the requested short format,
but did not research or cite its technical claim despite the research instruction. This is
a smoke test, not proof of teaching quality, source-policy compliance, or caching savings.

Caching increment verification: 185 backend tests passed with no skips, including migration
and schema checks. Backend/frontend lint, TypeScript, and diff whitespace checks passed.
