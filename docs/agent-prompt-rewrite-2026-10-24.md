# Platform prompt rewrite — 24 October 2026

The user requested longer, more structured platform responses and a rewrite informed by
public prompt examples on GitHub. This changes the application's active prompt in
`backend/app/agent/prompts.py`, not merely the portable skill. It does not deploy the change.

## Response contract

Substantial learning questions now default to developed explanations: a direct opening,
descriptive Markdown sections, explicit reasoning, a worked example, and relevant limits.
Broad first explanations have a flexible guide of 600–1000 words with 4–6 sections;
focused mechanisms and procedures often need 300–600 words with 2–4 sections. These are
starting editorial choices, not empirically optimal lengths or enforced minima.
User constraints override them. Narrow follow-ups, saves, and stop requests remain brief.

Following the user's clarification, explanation quality is the primary goal: identify the
concept precisely, develop the mechanism, make difficult transitions explicit, and carry
a concrete example into the general principle where useful. The first answer should contain
the reasoning needed for its stated scope. Practice is optional when requested or useful
for resolving a specific confusion, rather than a routine addition to every explanation.

The prompt distinguishes understanding, practical work, investigations, comparisons, and
continuation. It provides a teaching arc without requiring identical section labels.
Research can use more than three sources when distinct findings need support. The focused
researcher now returns findings tied to URLs, scope, examples, and meaningful alternatives.
Language borrows ASD-STE100 clarity principles without claiming formal compliance.

The platform contract and existing memory/action instructions are preserved, including
ownership, opt-out, save agreements, read-before-revision, truncation protection, and short
save acknowledgements. The change adds no tools, execution capability, or automatic saves.

## Public examples reviewed

- [Archived Perplexity search prompt](https://github.com/asgeirtj/system_prompts_leaks/blob/main/Perplexity/perplexity-search.md): separates role, tool use, and response guidelines; specifies a direct opening, meaningful sections, comparisons, and source support. Atlas adapts these ideas to teaching rather than copying the archive's formatting restrictions or tool assumptions.
- [Archived Claude Sonnet 4.6 prompt](https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-sonnet-4.6.md): separates memory, search, and presentation concerns. Host-specific tools and rules are not imported.
- [Anthropic's published Sonnet 4.6 prompt](https://platform.claude.com/docs/en/release-notes/system-prompts/claude-sonnet-4-6): provides an official comparison for the distinction between casual replies and detailed explanations. Its restrictive list formatting is not appropriate for Atlas's requested structured output.

The GitHub files are third-party reported extracts. Their authenticity, completeness, and
current production use were not established. They provide design examples, not evidence
that the new Atlas prompt improves learning. The resulting instructions are written for
Atlas's actual renderer, researcher, memory tools, and user request.

## Verification and next evaluation

Backend prompt lint and 35 existing scripted agent, service, and evaluation tests passed.
These exercise runtime integration, tool behavior, limits, and instruction delivery;
scripted model responses do not test how a live model follows the rewritten instructions.

Four live-review cases were added to `backend/tests/agent_scenarios.json`:

- `structured-first-explanation`: depth, mechanism, example, and boundary conditions.
- `structured-answer-narrow-followup`: a developed first response followed by a two-sentence clarification.
- `worked-procedure`: SQL input, query, expected output, and optional practice.
- `research-comparison-depth`: evidence that qualifies a universal learning claim.

No live provider evaluation was run for this rewrite. Before promoting it, compare original
and rewritten prompts on the same model and cases, reviewing correctness, useful depth,
source support, follow-up adaptation, latency, and cost. Verify the evaluation runner's SSE
execution path before running live cases; the earlier proposal records this transport gap.
Do not treat longer output or more headings as a successful evaluation by themselves.
