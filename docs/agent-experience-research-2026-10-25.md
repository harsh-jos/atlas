# Atlas agent experience: findings and proposal

25 October 2026. Research and design proposal; application code and hosted data have not been changed.

## Decision

Build an explanation experience with inline components, useful concept pages, conversation provenance, and optional reusable artifacts. Keep the existing Next.js and Python ADK application. Improve one complete learning interaction before broadening the toolset.

The missing advantage is continuity: an explanation a person can inspect and manipulate today, then find and build on later. A long answer and a graph of titles do not deliver that advantage.

## What the hosted account actually contains

Read-only queries used the configured hosted Supabase connection, filtered to the requested account. No credentials or full conversation transcripts are copied into this document.

| Observation | Latest conversation | Earlier conversation |
| --- | --- | --- |
| Topic | PyTorch versus TensorFlow, focusing on computation graphs | SonarQube, code smells, coding standards |
| Date, India time | 25 October, 6:45 pm | 24 October, 9:11 pm |
| Provider model recorded in usage | `gemini-3.8-flash` | `gemini-4-argon` |
| Status | Completed | Completed |
| Submit-to-completion duration | 80.4 seconds | 229.3 seconds |
| Words, simple whitespace count including code | 1,454 | 804 |
| Markdown headings | 17 | 4 |
| Recorded model requests, including researcher | 5 | 5 |
| Concepts added | 1 | 2 |
| Concept connections added | 0 | 1 |

The account has three concepts, one connection, and no saved artifacts. Memory is enabled; automatic explanation saving is disabled. All three concept overviews are null. The latest concept has a single-sentence description. Both turns completed without recorded turn errors, tool errors, or limit events. Stored model cost estimates were approximately $0.150 and $0.477 respectively; these are application estimates, not invoices. Durations include the entire turn, not just provider inference or time to first visible text.

This is two observations, not a general model comparison. The selected model override also applies to the researcher in `root.py`; a dedicated search-model default does not override that selection.

### Why the latest answer disappoints

It has substantial content, but a weak reading sequence. It leads with the historical TensorFlow 1.x split, spends most of the answer there, then explains current convergence at the end. It switches between kernels, Python control flow, gradient bookkeeping, serialization, and compilers before settling a beginner's core model. ASCII sketches stand in for the very graph the user wants to understand. Three source links appear as a footer rather than beside the claims they support.

The answer also overstates some mechanisms. It describes backward traversal as a linked list even though branching matters to the explanation. It says the entire graph is destroyed after backward, where saved-tensor lifetime and retained references require more precise language. Its recording rule omits the effect of gradient modes. These are examples to repair in evaluation, not a complete factual audit. [PyTorch's autograd mechanics](https://docs.pytorch.org/docs/2.14/notes/autograd.html) is the primary reference for recording and saved values.

The modern TensorFlow baseline belongs near the opening: TensorFlow 2 defaults to eager execution, while `tf.function` creates graph execution. [TensorFlow's guide](https://www.tensorflow.org/guide/function) supports that distinction.

### Causes visible in the implementation

- `backend/app/agent/prompts.py` explicitly says to remember “one or two concepts.” Sparse extraction is an instruction, not merely model forgetfulness.
- `remember_concept` asks for a short description. The implementation accepts up to 2,000 characters but only inserts new records; a later encounter does not enrich an existing one.
- There is no post-answer extraction stage, evidence span, or concept-to-conversation association.
- `Concept.overview` already exists, but this tool does not populate it, and the collection page does not render it.
- The teaching agent receives ten application tools plus the researcher. Several manage bookkeeping rather than help explain the current question.
- The application can store MD, HTML, and PDF artifacts, but the agent can only save/revise Markdown. Existing HTML is sanitized reading content, not a JavaScript simulation runtime.
- Chat rendering supports Markdown, math, tables, and code. It has no registered learning-component protocol.
- The request owns generation. Closing its SSE connection cancels work; replay restores saved output but does not resume generation.
- Local defaults allow 12 model calls and 300 seconds. The deployment example uses 480 seconds; this review did not inspect the effective Cloud Run configuration. Neither observed turn exhausted its call allowance.
- The stored records lack prompt/build fingerprints. The locally rewritten prompt cannot be proven to be the exact deployed prompt from these records.

## Inline UI: what to borrow

| Option | Verified capability | Fit for Atlas |
| --- | --- | --- |
| Thesys OpenUI | Component-library instructions plus a streaming React renderer | Closest to the requested integration; first candidate to prototype |
| Thesys open-intelligent-ui | Open-source recreation of Intelligent UI using OpenUI | Design and component reference; avoid copying its whole demo configuration |
| CopilotKit OpenIntelligentUI | Native UI and sandboxed generated interfaces, using CopilotKit/AG-UI | Valuable reference for later simulations; larger integration footprint |
| Vercel json-render | Catalog-driven JSON UI generation and rendering | Alternative if Atlas wants JSON specifications as its primary contract |
| OpenAI ChatKit | Inline widgets, streaming, and actions with a custom server option | Viable if replacing more of the chat surface; unnecessary for the first increment |

Primary sources: [OpenUI](https://github.com/thesysdev/openui), [Thesys demo](https://github.com/thesysdev/open-intelligent-ui), [CopilotKit demo](https://github.com/CopilotKit/OpenIntelligentUI), [json-render](https://github.com/vercel-labs/json-render), [ChatKit widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets), [custom ChatKit](https://developers.openai.com/api/docs/guides/custom-chatkit).

OpenUI's documented integration defines a component library, generates instructions from its specification, and streams output into a renderer. It supports an existing agent and chat UI. This is close to the user's proposed approach. Its gateway adds repair behavior; direct use with Atlas's current provider needs its own malformed-output handling and evaluation. [OpenUI integration guide](https://www.openui.com/docs/getting-started), [agent integration](https://www.openui.com/docs/build-agents).

Recommendation: prototype the renderer inside Atlas, without migrating the agent framework. Compare its reliability and prompt cost against a small custom JSON-block renderer before committing. Pin the tested dependency version. The recommendation is an architectural judgment, not a claim that these projects were benchmarked in Atlas.

### The first component library

Build six useful components, all styled with Atlas's own tokens:

| Component | Purpose | First concrete use |
| --- | --- | --- |
| Diagram | Explain dependencies or flow | Forward values and backward gradients |
| Stepper | Show one meaningful transition at a time | Execute an operation, then record its derivative rule |
| Compare | Align alternatives on the same criteria | Eager execution, tracing, and compilation |
| Plot | Explore a specified numeric relationship | Function value versus slope |
| WorkedExample | Keep code, inputs, intermediates, and result together | Small chain-rule calculation |
| ImageFigure | Show a generated/uploaded image with caption and alt text | A physical mechanism or spatial analogy |

A source popover and ordinary callout can be shared primitives. Do not add a different decorative card for every paragraph. Plain text remains a first-class component; narrow follow-ups can stay plain text.

The model chooses the component and its position inside one assistant response. A short paragraph leads into a diagram; the explanation continues below it. No second “visual answer” and no separate visualization model are needed for registered components.

### Persistence and streaming contract

Use a versioned canonical response representation with stable block IDs, ordered blocks, and a plain-text fallback. If OpenUI is selected, store its versioned payload as a block; avoid creating a second competing layout language.

```json
{
  "schemaVersion": 1,
  "blocks": [
    {"id": "intro", "type": "markdown", "text": "A graph records which results depend on which inputs."},
    {"id": "example", "type": "component", "name": "Diagram", "props": {"exampleId": "chain-rule-01", "view": "forward-backward"}},
    {"id": "reason", "type": "markdown", "text": "Backward uses the same dependencies in reverse."}
  ],
  "fallbackText": "A graph records dependencies; backward uses them in reverse."
}
```

This is a proposed Atlas envelope, not a copy-paste OpenUI API example. `exampleId` must resolve to validated stored example data, never a model-invented resource.

Extend the persisted event stream with block start/update/complete events. Validate component names, props, size/depth, data references, and asset ownership. Only complete valid blocks become canonical output. Keep a readable fallback when a block fails; do not expose raw partial JSON. Reload and history must reconstruct the same order without duplicating the final aggregate.

Sliders and step controls run locally. “Explain this step” can start a new turn with validated selected state and the originating block ID. Persist meaningful user state when useful; do not silently spend model calls on every slider movement. Reject unknown actions on the server. Native components execute application code, not model-supplied JavaScript.

## Image generation

Nano Banana 2 maps to `gemini-3.1-flash-image`. Google's documentation also lists Nano Banana 2.1 as `gemini-nano-banana-2.1`. Keep the tool provider/model configurable and test availability in the actual project before choosing a default. The image model is invoked by the main agent's tool, rather than replacing the guide. [Nano Banana 2 model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image), [Nano Banana 2.1 model](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1).

Proposed tool:

```text
generate_image(teaching_goal, factual_brief, composition, labels, aspect_ratio)
  -> asset_id, caption, alt_text, provider_model, generation_status
```

The backend supplies the visual style: warm white background, charcoal labels, muted teal/slate/ochre accents, generous spacing, restrained flat illustration, and a clear focal mechanism. Store bytes in the private asset bucket through the existing quota path; return an owned asset reference. Include model usage, cost estimates, and failure states in turn accounting. Add a per-turn image allowance, initially one, with a second allowed when it contributes a distinct view.

The brief says what the learner should see and what would be incorrect: for example, conservation relationships, direction of flow, labels, and which analogy limits matter. Review the resulting image visually before embedding it as instruction. That requires passing image content back to a capable model or an explicit review stage; a successful provider response alone does not establish correctness. Retry at most once under the same budget, then fall back to prose or a native diagram. Google's generation guide covers image generation and editing; visual review policy here is an Atlas proposal. [Image generation guide](https://ai.google.dev/gemini-api/docs/image-generation).

Use native diagrams for exact graphs, plots, code traces, and formulas. Use image generation for spatial/physical concepts where illustration carries information. For the latest conversation, a native computation-graph component is the better first choice. Calm styling is a design requirement, not evidence of factual accuracy.

## Response quality

Replace default word/section ranges with task-sensitive examples of good output. Keep enough depth to answer the question, but reveal complexity in a useful order. “Simpler” means fewer simultaneous ideas, explicit transitions, and consistent vocabulary.

Suggested prompt contract:

> Answer the actual question in the opening. Choose one concrete example and carry it through the difficult reasoning. Introduce unfamiliar terms when they become necessary. Use a registered component only when it makes a relationship, change, or comparison easier to inspect. Place it beside the relevant explanation and continue the same response. Establish the current baseline before historical exceptions. Put optional implementation detail behind an explicit expansion. Cite the claim the source supports. Stop when the question is resolved; do not add a routine recap, quiz, or next-topic menu.

For the reviewed question, start with the fact that the old static/dynamic division is historical and both modern frameworks support eager and graph-based workflows. Then explain what a graph records using `y = (3x + 2)^2`, followed by one control-flow comparison. TensorFlow's eager/graph distinction is documented in its [function guide](https://www.tensorflow.org/guide/function). Keep TensorFlow 1.x sessions as optional historical detail.

The component should let the reader set `x=1`, see `u=5` and `y=25`, then follow `dy/du=10` and `du/dx=3` to `dy/dx=30`. Show that the graph retains dependencies needed by differentiation. A separate control-flow example can switch between two input-dependent paths. These are different mechanisms; do not pretend the scalar derivative example alone explains dynamic control flow.

## Better graph extraction and useful node pages

Move routine graph and context bookkeeping out of the teaching model's exposed tools. After a completed substantial response, schedule one structured extraction/enrichment job using the user question, authoritative answer blocks, retrieved evidence, and a bounded set of existing concepts. This can use the same model/provider with a separate instruction; it does not require a multi-agent framework.

Pipeline:

1. Extract concepts that received real explanation, evidence spans, and proposed semantic relationships. Mere mentions and unvisited prerequisites do not qualify.
2. Resolve existing names and aliases, using exact/normalized matching first and semantic candidate search where needed. The current full-text search over artifacts is insufficient for concept identity resolution.
3. Validate schema, ownership, evidence references, non-self edges, direction, deduplication, and allowed relation kinds. Deterministic validation establishes structural validity; sampled human review evaluates semantic truth.
4. Commit a revisioned batch with an idempotency key based on owner, turn, answer revision, and extractor version. Preserve human edits and conflict information.
5. Publish an enrichment status independently of answer completion. Failures can retry without rerunning the teaching answer.

For the latest answer, plausible candidates include computation graphs, reverse-mode differentiation, static graph execution, dynamic graph recording, graph tracing, and graph compilation. Treat these as review candidates, not a six-node quota. A narrow follow-up may add zero nodes; a substantive explanation may justify several.

Each concept page should contain a concise description, a developed overview, a concrete example drawn from the discussion, relevant limitations, typed neighbours with reasons, and conversation excerpts. A two-sentence tooltip can stay short; it should open a useful page. The existing `overview` field is a starting point, but needs a revision/enrichment path and UI rendering.

Add relation kinds such as `contrasts_with`, `uses`, `part_of`, and `enables` only where they express useful meaning. Existing concept tools support only `requires` and `related_to`; artifact relation types are a separate contract. Update concept validation, schemas, API types, direction/symmetry rules, filters, labels, and rendering together.

Never turn exposure into a mastery score. Preserve the memory-off preference. Extraction should not create a standalone library artifact when auto-save is off.

### Conversation provenance

Add a many-to-many evidence table such as:

```text
concept_mentions(
  user_id, concept_id, session_id, turn_id, block_id,
  answer_revision, excerpt, extractor_version, created_at
)
```

Use server-validated turn/block references and unique evidence keys. Concept pages and the graph inspector show an excerpt plus “Open conversation.” Store multiple mentions across chats. Link to `/chat/{sessionId}?turn={turnId}&block={blockId}` and implement target loading, scrolling, and highlighting. A URL fragment alone will fail when the target is outside paginated history. Current `ChatMessage` projections also need stable turn/message identifiers.

Ownership must be checked when reading the mention and the linked conversation. Deletion should remove or invalidate evidence and update generated overviews; preserve unrelated evidence and user-authored edits. Do not create public conversation URLs.

## Artifacts

An inline explanation is the default. An artifact is a versioned object worth reopening: an explorable graph, annotated notebook, visual reference, comparison sheet, or small simulation. Start with saved versions of the same validated response blocks so chat and reader do not diverge.

Add `create_artifact`/`update_artifact` for supported formats, structured content, asset references, provenance, and optimistic revision checks. Retain the existing preference contract: explicit creation requests can save immediately; automatic library saving requires the existing continuing agreement. Generating inline media within a persisted chat should be documented as chat content, separately from library promotion.

Ship reusable MD and validated component documents first, then HTML simulations. The current `HtmlBody` intentionally removes scripts. Executable artifacts need a distinct isolated runtime: sandboxed iframe, constrained capabilities/network, validated message bridge, resource/time limits, and immutable revisions. Do not weaken the ordinary reader sanitizer. Add PDF export once a stable document representation can be rendered reliably.

## Runtime and tools

Longer work should be possible without imposing longer waits on every question.

Keep the existing durable submission and event log. Move execution to a durable Cloud Tasks/worker path or equivalent managed job mechanism; SSE becomes observation. Use a worker lease, fencing against stale workers, checkpoints, retry classification, and idempotent writes. Reconnecting subscribes to the current job instead of cancelling it. Restore explicit Stop/cancellation and mark partial work honestly. This is an architectural change from the current request-owned execution, not a timeout adjustment.

Use a bounded overall deadline plus per-tool limits and spend admission. Let ordinary answers finish promptly; allow heavier image/artifact work to continue with truthful progress. Preserve browser-independent compute through an explicit worker/job lifetime, rather than an untracked async task on request-based Cloud Run. Meter extraction and image work too. Expose accurate stages such as “Checking sources” and “Building diagram,” not private reasoning.

| Capability | Proposed placement |
| --- | --- |
| Search/read prior knowledge and local graph neighbourhood | Keep available to guide; combine result shapes if useful |
| Focused researcher | Keep; prefer primary evidence and avoid redundant research prose |
| Fetch/read source page | Add only after confirming existing grounding cannot supply needed evidence; return bounded content and metadata |
| Native learning components | Response format, not a tool call for each card |
| Generate image | Add as a bounded guide tool |
| Create/update artifact | Add after supported formats and persistence are ready |
| Execute small calculation/code | Later, isolated sandbox with explicit execution evidence |
| Remember/connect concepts and update notes | Move routine work to post-answer enrichment |
| Preferences and graph corrections/deletion | Prefer explicit UI actions; preserve conversational requests through a small validated action surface |

Do not add a planner, critic, and second writer to every turn. Add a bounded review step for concrete needs such as visual correctness or executable artifacts. The earlier session already took almost four minutes for a text answer.

## Delivery order and quality gates

1. **Evidence and baseline:** repair `evaluate.py` to consume the execution-owning SSE endpoint; it currently submits then polls, so the evaluator does not start queued execution. Record deployment/build, prompt hash, model IDs, component schema, and tool versions. Replay the two observed questions in a dedicated test account. This review did not run provider evaluations or incur new model-generation charges.
2. **First visible improvement:** revised response examples, versioned blocks, Diagram/Stepper/Compare, persistence/replay fallback, and source placement. Produce a distinctly better version of the computation-graph interaction.
3. **Useful graph:** structured enrichment, richer concept pages, canonical identity resolution, semantic edges, and conversation deep links.
4. **Image and artifact tools:** private asset storage, review, quota/cost accounting, reusable component artifacts, revision history.
5. **Durable long work:** implement worker-owned execution before enabling jobs expected to outlive a browsing session; then add sandboxed simulations and code execution.

Phases 4 and 5 may overlap, but browser-independent long jobs must not be advertised before phase 5 works. This sequencing is not a calendar estimate.

Evaluate matched old/new outputs on the same models with comparable budgets. Blind review for correctness, clarity of mechanism, relevance, reading effort, component usefulness, and source support. Test narrow follow-ups as well as broad first answers. Validate computed examples and diagram dependencies independently.

For extraction, assess coverage of substantive concepts, duplicate rate, false or generic edges, overview usefulness, evidence fidelity, and successful return to the exact discussion. Node count is diagnostic, not the success metric. Verify memory opt-out and deletion. Test stream interruption, malformed component fallback, replay without duplicate blocks, failed images, stale artifact revisions, and cancellation.

Track time to first useful explanation, answer completion, optional artifact completion, total cost per useful interaction, and tool failure rate. Ask learners whether they can use the explanation on a changed case and retrieve it later. Do not equate a larger graph, longer session, or prettier output with learning.

## Additional product ideas

- **Ask about this:** select a sentence, code line, or diagram node and ask a focused follow-up with that exact context.
- **Change one thing:** show a meaningful variable the reader can alter, with assumptions visible. Recompute locally where possible.
- **One example across surfaces:** use the same inputs, labels, intermediate values, and concept IDs in prose, diagrams, artifacts, and saved nodes.
- **Return to the unresolved question:** retrieve the useful excerpt and actual sticking point instead of generating an unsolicited recap.
- **Evidence beside the explanation:** distinguish official behavior, worked illustration, and analogy, with version scope when relevant.
- **Progressive detail:** put the core explanation in the reading flow and implementation/history behind explicit expansion. Do not collapse the reasoning needed to understand the answer.

The first release should prove one interaction: ask the computation-graph question, understand it through a coherent explanation and manipulable example, then return through a useful concept node to the exact conversation.
