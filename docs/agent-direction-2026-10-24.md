# Atlas agent direction — proposal, 24 October 2026

This is a working proposal, not a replacement for `docs/product.md` or a claim about deployed behavior. The candidate portable skill is in `skills/atlas/`. It has not been installed globally, wired into the application, or validated with real learners.

## The promise

**Bring a question. Build an explanation you can use. Keep the thread when you return.**

Atlas should help someone explain, predict, decide, or do something they could not do before. It should show what supports an explanation, where it applies, and what remains uncertain. The person controls direction and saving. Each visit can be useful on its own.

This is a proposed product commitment to a process and useful outputs. It is not a guarantee of mastery, retention, universal accuracy, or faster learning. Those outcomes require evidence.

Start with self-directed technical learners: people who can read documentation but get stuck on mechanisms, assumptions, or how ideas connect. The repository already names Python and PyTorch as first cases. Validate this audience before advertising that Atlas teaches anything to anyone.

## What exists today

| Surface | Observed contract |
| --- | --- |
| Application | Conversational guide, focused web researcher, saved Markdown explanations, concept connections, persistent chats and memory preferences. |
| Installed Atlas skill | Research a topic and produce one HTML lesson around a mental model. |
| `atlas-skill` repository | Portable artifact workflow with writing, question selection, design, and continuation references. |
| `atlas-website` | Showcase for three projects: an Obsidian research agent, a platform promising structured learning paths, and a portable skill. |

These are related but different promises. The website's structured-path description does not match the application's voluntary question-led exploration. Its claim to carry how a person wants to learn everywhere also exceeds what a skill file alone can do: persistent learner context needs an explicit portable representation and host support.

Use the website as a source of visual and editorial ideas. Align its claims after deciding the product contract; do not build features simply to satisfy old copy.

## The prompt in use

`backend/app/agent/prompts.py` defines:

- `LEARNING_INSTRUCTION`: question selection, mechanism-first explanations, examples, optional predictions, language, research, memory, and saving.
- `PLATFORM_INSTRUCTION`: appended to the learning instruction; record types, graph semantics, ownership, and tool honesty.
- `RESEARCH_INSTRUCTION`: evidence gathering for a focused question, including assumptions and counterexamples.

`backend/app/agent/root.py` supplies these as static instructions to an ADK guide and a researcher exposed as a tool. `backend/app/agent/context.py` adds preferences and bounded conversation notes dynamically. Defaults in `backend/app/core/config.py` select `gemini-4-argon` for both; runtime configuration can override defaults. Both use high thinking. No application output-token ceiling is set in this construction. There is no code execution tool.

The installed portable skill is not loaded into this runtime. Editing it alone will not improve the deployed agent. Shared pedagogical decisions must be translated into the application prompt while preserving its tool and consent contracts.

The active prompt already has many good instructions. More instructions are not automatically the missing ingredient. The next work is selecting observable behaviors, comparing outputs, and improving the product surfaces that support them.

## Why choose Atlas over a general assistant?

A general assistant can explain a topic, research it, generate a lesson, and remember context. A special prompt and a graph are weak differentiation on their own.

The proposed advantage is consistent support across the whole experience:

| Friction | Atlas response | Proof to collect |
| --- | --- | --- |
| I do not know the right question to ask. | Choose an entry that serves my actual goal and start explaining. | Learner finds the first explanation relevant without prompt coaching. |
| I can follow the prose but cannot use the idea. | Worked case, a changed case, and feedback on my reasoning. | Learner explains or solves a nearby case. |
| I cannot tell which parts are established. | Claim-level sources, assumptions, disagreement, and explicit inference. | Important claims withstand source inspection. |
| I lose the useful explanation in a long chat. | Save a standalone answer that can be found and revised. | Learner retrieves it for a real later task. |
| Returning means explaining my situation again. | Retrieve the relevant question and explanation; offer only the needed refresher. | Less restating and redundant teaching on return. |

These are hypotheses. The current product has foundations for several, but they are not demonstrated competitive advantages yet.

## The learning experience to build

Example: “I know Python and algebra. Why does autograd need a graph?”

Start with an expression such as `y = (3*x + 2)**2`. Explain how the result depends on intermediate values, then why backward computation needs those dependencies. Ask for a small prediction only if it helps reveal the person's model. If they make a mistake, address the exact mistaken step. Show a changed expression so the explanation does more than fit one example. Save a useful explanation when requested. On return, retrieve that explanation rather than claim they mastered derivatives.

For this subject, correctness requires qualifying the graph: PyTorch records operations for autograd under relevant gradient-tracking conditions; not every tensor tracks its history. The old skill's tensor framing omits this distinction. Catching such simplifications is part of the experience, not a final cosmetic edit.

Different questions need different work. “How do I write this query?” needs a worked procedure. “Which database fits these constraints?” needs comparison and decision criteria. “Does this paper support its headline?” needs methods, findings, assumptions, and competing explanations. Do not convert all three into the same mental-model essay.

## Research should produce usable evidence

The current researcher is designed to support an explanation. It is not yet a complete investigation workspace.

First improve its output contract: for each important finding, retain the supporting source, relevant scope or version, and whether the conclusion is directly reported or inferred. Investigate the disagreement that could change the answer. One primary source can be enough for a documented API behavior; a disputed empirical claim needs a different standard.

The product could later make a citation inspectable beside the exact claim, show contradictory findings together, and retain evidence when a saved explanation changes. These need source data and reader support; a prompt cannot create provenance that the application does not store.

Do not infer consensus by counting search results. Do not treat a paper's abstract as verification of all its methods. Report inaccessible evidence and its effect on the conclusion. Avoid promising exhaustive research from bounded search.

## Tone, size, and output quality

Use a precise, interested voice with connected prose. Define necessary terms, show mechanisms, and name relevant assumptions. Correct mistakes directly. Do not narrate the reader's feelings or imitate an essayist's mannerisms.

Choose size by the task and the person's constraints. A clarification can be one paragraph; a worked example may need code and explanation; an investigation may need a substantial comparison. If someone gives a time or word limit, honor it. “No fixed length” must not become permission to ignore the cost of reading.

Use optional prediction, retrieval, self-explanation, comparison, and practice for a reason. Do not add a quiz to every answer. When asking for an attempt in conversation, wait before revealing the solution. For an artifact, provide an answer reveal. Repeating the answer immediately can remove the opportunity to think.

Retrieval practice improved learning relative to concept mapping in [Karpicke and Blunt's experiments](https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Blunt_Science.pdf). That does not show that browsing Atlas's concept graph causes learning or that every reply needs retrieval. [Yeo and Fazio's experiments](https://doi.org/10.1037/edu0000268) found that the value of retrieval versus worked examples depends on the learning goal and conditions. Use this evidence to choose and test interventions, not to claim Atlas is proven.

## What ASD-STE100 contributes

The application already says “Apply ASD-STE100 Simplified Technical English rules.” It then names selected clarity principles and disclaims certification. This is stronger wording than the current implementation can verify.

ASD-STE100 is a controlled language with writing rules and a dictionary, not simply a synonym for clear prose. See the [official FAQ](https://www.asd-ste100.org/STE_faq.html) and [official Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf). The official pages were discoverable through search; direct page retrieval was blocked during this review. No rule-by-rule compliance audit was performed.

Use its principles where they help: consistent terms, explicit references, direct verbs, and manageable sentences. Preserve the qualifications that make an explanation true. Do not force a literary or scientific explanation into maintenance-manual prose. Proposed wording: “Use clear technical English informed by ASD-STE100; do not claim formal compliance.”

## Rebuild the skill around decisions

The candidate at `skills/atlas/SKILL.md` is written from a new structure rather than extending the old rules. It supports understanding, investigation, practical work, and continuation. HTML remains available when useful, rather than mandatory for every request.

Keep the old skill's focus, concrete mechanisms, source checking, respect for stopping, and attention to reading design.

Replace these rules:

- “Assume the model landed.” Prior exposure is not demonstrated understanding or retention.
- “Never recap,” “never summarize,” and blanket exclusions of tutorials or courses. Honor the person's task; use editorial judgment when they have not specified it.
- Mechanical imitation targets, such as an example every seven sentences. Judge whether the example changes what the reader can reason about.
- Absolute research and motivational claims without their conditions. Separate product values from empirical findings.
- One imposed question for every topic. A decision or synthesis sometimes needs competing models.

Keep host capabilities separate from pedagogy. The portable skill should not invent platform memory tools, promise persistence, or grant permission to save. The application prompt must retain its more specific ownership, memory, revision, and action contracts.

## First product experiments

1. **A changed-case check.** After an explanation, offer one useful variation. Compare feedback quality and transfer against explanation alone. Support skipping; keep correctness judgments local to the attempt.
2. **Ask about a passage.** Attach a question to selected text and retain the paragraph as context. Resolve that exact confusion without generating a new lecture. This needs reader selection and conversation context support.
3. **A useful return.** Retrieve the saved explanation and actual unresolved question. Let the person continue, refresh a prerequisite, or ask something else without a required ritual.
4. **Inspect the evidence.** Open the source associated with a claim, show its scope, and distinguish source findings from synthesis. Store the relationship rather than merely decorating citations.

These are ranked proposals, not all authorized implementation tasks. Existing Markdown readers do not become interactive lesson runtimes through a prompt change. Start with conversational behavior that can be evaluated before adding custom blocks or simulations.

## Establish quality before promotion

Use the existing behavioral scenarios as a base. Add practical-skill, disputed-research, source-failure, changed-case, and advanced-background cases. Compare old prompt, candidate prompt, and a general-assistant baseline on the same model with comparable tools and budgets. Repeat runs and blind the review order.

Review correctness, relevance, mechanism, evidence, adaptation, and reading effort separately. Fabricated sources and materially wrong models fail regardless of style. Inspect stored effects for memory and saving scenarios. Track latency and cost; slow replies can erase the advantage of a better explanation.

Then test with real learners: can they explain or solve a nearby case, find a saved explanation again, and return without restating their context? Use an optional delayed check if retention is part of the claim. Do not equate session duration, graph size, satisfaction, or return rate with learning.

The October 10 live evaluations found improvements and factual overgeneralizations on the earlier model. The current documentation says the Argon default still needs a live teaching review. Unit tests and provider smoke checks establish infrastructure behavior, not instructional quality. This proposal has not run a new live evaluation.

Before using the existing live evaluation runner, check it against current SSE execution: `evaluate.py` submits and polls, while `docs/agent-runtime.md` describes an execution model that also requires the events request. Confirm or fix that mismatch before interpreting a queued timeout as model quality.

Recommended next sequence: agree on the promise and target user; incorporate Harsh's experience ideas; translate the chosen teaching changes into a candidate application prompt; fix the evaluation transport if needed; run matched cases; then implement the strongest reader interaction. Update showcase claims after those decisions and results.
