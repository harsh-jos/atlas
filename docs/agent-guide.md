# Atlas agent: explanations, components, tools, and memory

Updated 25 October 2026. The runtime remains Google ADK with Gemini and a Next.js frontend.
The guide answers the actual question, establishes the current baseline before history, and
carries a concrete example through the mechanism. Depth follows the task rather than word or
heading quotas. Optional detail can expand without fragmenting the central explanation.

## Inline responses

`agent/response.py` defines the versioned document and bounded Pydantic component schemas.
The guide writes ordinary Markdown interleaved with fenced `atlas` JSON objects. The frontend
validates these into native React components; it never evaluates generated component code.
This keeps the existing agent/provider and avoids a second visualization model or an entire
chat-framework migration. The same blocks render in chat and reusable component artifacts.

Available components:

- `diagram`: selectable nodes and labelled dependencies, with a readable detail panel.
- `stepper` and `worked-example`: meaningful intermediate steps, optional code, and follow-up.
- `compare`: aligned criteria across two to four alternatives.
- `plot`: a degree-six-or-lower polynomial with an input slider, value and local derivative.
- `image`: an owned image asset, accessible description and caption.
- `details`: expandable supporting Markdown.

Every component needs a title and useful text fallback. Native controls run locally, retain
state across reloads in browser session storage, and can send a focused question to the composer.
Selecting an explanatory passage offers a contextual question. These actions prepare a draft;
the person submits it. Copy/text export includes the substantive visual text, not raw JSON.

The canonical response is persisted on its turn; the raw provider answer remains available for
history and model context. Component IDs and turn IDs support exact conversation destinations,
including turns outside the normal history page. Invalid/unfinished blocks never expose their
raw payload as the explanation.

## Tools

| Tool | Contract |
| --- | --- |
| `researcher` | Focused grounded research with source URLs, scope, and counterexamples. |
| `search_knowledge_base` | Search owned saved explanations; exposure does not imply mastery. |
| `inspect_concept_graph` | Bounded neighbourhood/recent concepts; records inspected edges. |
| `read_saved_explanation` | Read content, kind, metadata, sources and timestamp before reuse/revision. |
| `read_source_page` | Bounded public HTTPS reading, public-address validation and pinned DNS/TLS connection; retrieved content is untrusted. |
| `calculate` | Bounded numeric arithmetic via an AST allowlist; no arbitrary code, imports or functions. |
| `generate_image` | Bounded Nano Banana generation followed by a separately metered visual review. Only approved images become private assets. |
| `create_artifact` | Save Markdown, component documents or self-contained HTML simulations when requested/agreed. |
| `update_artifact` | Revise after reading, with optimistic timestamp checks and immutable prior snapshots. |
| `set_learning_preferences` | Change only explicitly requested memory/saving preferences. |
| `remove_concept_connection` | Explicitly requested removal of an owned edge inspected in this invocation. |

Routine remember/connect/context tools have been removed from the guide's exposed toolset.
They are replaced by post-answer structured enrichment, not additional conversational model turns.
No arbitrary Python execution or external-script simulation dependency is exposed.

## Images and artifacts

Default image model: `gemini-3.1-flash-image`; configurable via `AGENT_IMAGE_MODEL`.
`gemini-nano-banana-2.1` is also priced by the ledger. Review and extraction default to
`gemini-3.8-flash`. Actual project/model access requires a provider smoke check before rollout.

The backend supplies calm colours, whitespace, legible labels and a factual teaching brief.
A vision model checks the generated pixels against that brief before private storage. Rejected
attempts count toward the allowance. A failed image must not prevent a useful answer. Use native
components for exact graphs, plots and code traces. Review is a quality check, not a correctness guarantee.

Artifacts save the same response components or a standalone explanation. Downloads export
Markdown, component JSON or HTML; the reader also supports browser print/save PDF. Revision
snapshots consume storage quota and are released with their parent artifact. Source conversation
links and sources are retained. Existing ordinary HTML continues through the sanitizer.

Executable simulations have a distinct `sandbox-v1` runtime: opaque-origin iframe, no host bridge,
external scripts, subresource network access, workers or forms. They start only when clicked and
have Stop/Restart controls and a one-minute playback timer. This browser sandbox does not provide
server-side code execution or a process-level CPU limit. Network-independent simulation code
must be self-contained. Exported HTML is intended for standalone use outside the app's sandbox.

## Concept enrichment and provenance

Completed explanations schedule one structured extractor with bounded existing concept candidates,
prior conversation notes and the canonical answer. It selects substantive ideas, resolves names and
aliases, and supplies exact block excerpts. Commit validation rejects unsupported excerpts, unknown
edge endpoints, self-links and unsupported relationship kinds. Each edge requires textual evidence.
This establishes grounding/structure, not an independent proof of semantic truth.

Nodes can have developed overviews, examples and qualifications. Generated overviews are revisioned;
human overview/description edits lock enrichment from overwriting them. Existing aliases and optimistic
timestamps reduce duplicate concepts and lost updates. There is no fixed node quota or mastery score.

Concept connections support directed `requires`, `uses`, `part_of`, `enables`, and symmetric
`related_to`, `contrasts_with`. Artifact membership derives `explains`. Graph inspectors and concept
pages show supporting conversations. These are private owned links to exact turns/blocks.

## Preferences and operations

Memory defaults on, automatic library saving off. Enrichment rechecks memory under the owner lock.
Turning memory off prevents new concept/connection/context writes; it does not erase chats or prior
records. Inline media is persisted chat content, separate from promoting an artifact into the library.

A one-time save request does not establish continuing agreement. Tools require `user_requested=true`
or the stored agreement. The model interprets the request; this is not an independent semantic consent
verifier. An explicitly requested artifact may create its necessary library grouping while concept-memory
extraction is off. The person can inspect, revise, export and delete saved artifacts.

[agent-runtime.md](agent-runtime.md) describes durable jobs, cancellation, cost settlement and retry
limits. Live teaching evaluations must use a dedicated test account; the fixed evaluator consumes
SSE then fetches the authoritative turn. Unit/scripted checks and successful builds do not establish
teaching quality or confirm hosted model/IAM availability.
