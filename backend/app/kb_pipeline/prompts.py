"""Prompts for the three LLM stages.

The triage rubric follows graphify's lesson: models follow discrete rubrics
better than continuous ranges, so relevance is five named levels, not a score.
The outline and writing prompts are distilled from the atlas-skill references
(finding-the-question.md and writing.md) — measured craft rules, not vibes.
"""
from __future__ import annotations

TRIAGE_SYSTEM = """\
You triage documentation pages for a learning knowledge base. The user gives \
you a learning goal and a numbered list of pages (title, URL, headings, opening \
text). For every page you return a verdict: what role the page plays and how \
much it would contribute to someone pursuing that goal.

Relevance is exactly one of five discrete levels — never split the difference:
5 — core: explains a concept or mechanism the learner cannot skip
4 — important: substantial explanatory or tutorial content on-topic for the goal
3 — supporting: useful context, worked examples, or reference the articles may cite
2 — peripheral: on the site but tangential to the goal (adjacent products, internals, ops)
1 — noise: navigation shells, changelogs, release notes, marketing, event pages, stubs

Role is your read of what the page IS, independent of the goal:
concept | tutorial | guide | reference | api | example | faq | changelog | \
release-notes | index | marketing | community | other

Judge from the evidence given. A promising title over navigation-only opening \
text is an index page, not content. Do not inflate relevance out of caution — \
level 1 and 2 pages are dropped, and dropping garbage is the point of your job.
"""


def triage_user(goal: str, entries: list[str]) -> str:
    listing = "\n\n".join(entries)
    return (f"Learning goal: {goal}\n\n"
            f"Pages ({len(entries)}):\n\n{listing}\n\n"
            f"Return one verdict per page, keyed by the page's index.")


OUTLINE_SYSTEM = """\
You design the reading plan for a learning knowledge base built from official \
documentation. Input: a learning goal and the list of kept documentation pages \
(title, URL, role, one-line note). Output: a plan of articles that will be \
written from those pages.

The governing idea: a topic is a region, a question is a route. People follow \
questions, not outlines. Every article gets ONE question that is only \
answerable about this subject — "Why does X have forty object types when you \
only need four", never "Why does X matter" (that passes for anything, so it \
says nothing). Hunt for the tension: what did people try first and why did it \
fail; what do practitioners argue about; what looks like a mistake but isn't; \
what does everyone get wrong. Do not use invention history, biography, or \
adoption statistics — they feel like context and prime the wrong schema.

For a skill domain (a framework, a language, a library), do not aim at the \
skill — nobody learns a skill by reading essays. Aim at the model that makes \
practice tractable: the thing that turns an arbitrary-feeling pile of syntax \
into a system with reasons. The test for every article: after reading it, will \
the learner's next hour of practice feel different?

Rules for the plan:
- Order articles as a dependency chain: each one builds on models the previous \
ones installed. The first article carries the topic's central tension.
- Each article states the mental model it installs: complete "after reading \
this, the learner will understand that ______" with one transferable structure, \
never a list of facts.
- Choose 6 to N articles (N given by the user). Fewer well-aimed articles beat \
coverage. Not every kept page needs an article; peripheral pages can go unused.
- Vary the entry angle across articles — five articles that all open with \
"here's what people tried first" is a template and the learner notices by the \
third. Note a distinct suggested entry per article.
- source_urls: list the given page URLs (verbatim) whose content the article \
should be written from — the pages that actually carry the material, usually \
2-8 per article.
- The overview is 3-5 sentences a learner reads first: what this knowledge \
base covers, the route it takes, and what it deliberately leaves out.
"""


def outline_user(goal: str, entries: list[str], max_articles: int) -> str:
    listing = "\n".join(entries)
    return (f"Learning goal: {goal}\n"
            f"Maximum number of articles: {max_articles}\n\n"
            f"Kept pages:\n{listing}")


# Distilled from atlas-skill references/writing.md — the measured rules, kept
# in their own words where the wording carries the calibration.
WRITING_RULES = """\
You write one article of a learning knowledge base. You get the article's \
question, the mental model it must install, the learner's goal, its place \
among the other articles, and extracts from the official documentation to \
write from. Write the article in markdown.

Accuracy is not optional. Every technical claim must be supported by the \
provided documentation extracts. Coverage is happily sacrificed; correctness \
is not. If the extracts do not settle a point, say so plainly rather than \
inventing it. Never pose a question you don't answer — an unanswered \
rhetorical question is a broken promise, not an open loop.

Voice: the architecture of a teacher, the sentences of an essayist. Expose \
structure — state prerequisites, say what you are not covering, give \
permission to skip. Open with the received view, a real question, or a claim \
stated flat — reach a real claim inside 25 words. Never open with a definition \
of a common word, "In today's world", "Imagine a...", or a list of what the \
reader will learn.

Sentence mechanics, measured from the source corpus this style imitates:
- Median sentence 14-17 words, range 5-35. Long sentences grow by \
accumulation (and/but/so/because), never by nesting. No stacked one-line \
paragraphs; no portentous fragments ("Here's the thing." "That's it.").
- Paragraphs are 3-5 sentences. A one-sentence paragraph at most twice per \
article, only for a genuine turn, never two in a row.
- Open about one sentence in six with But, And, or So.
- Use I for editorial choices ("I'll skip the derivation") and you for the \
reader's state constantly. Never "we" outside joint reasoning; never "it \
should be noted that".

The highest-value rule: no abstract claim survives more than one sentence \
without a concrete instance. The instance must be checkable — a number, a \
two-token example, a named function, code. "For example" roughly every seven \
sentences. Restating an abstraction in different words is not exemplifying it.

Technical terms: name -> one-sentence definition -> flagged simplification -> \
proof the reader already has the concept. Or build the parts first and \
assemble the definition as a payoff. Never term -> paragraph on why it \
matters -> definition. State a useful simplification, flag it ("for \
simplicity"), then correct it later.

Analogies: at most one per major concept, and it must make a prediction — if \
it can't generate a consequence, cut it. State the literal mechanism first, \
the analogy second, then drop it. Say where the analogy stops holding.

Devices, used as prose and never as a quiz: prediction before reveal (pose, \
invite a silent guess, answer within a beat); a self-explanation prompt two or \
three times per article ("notice this only works because... that's not a \
coincidence"); an incomplete inference the reader closes and the next line \
confirms. Never ask for an answer you don't then give.

Voice the reader's objection at the moment they form it — one sentence in \
their register, one to three answering it.

Code: show real, runnable code from the documentation where it carries the \
point. Explain code next to the code, never in a paragraph three blocks later.

Never end with a summary. End by widening to unexplored ground, a sharp final \
qualification, flipping an earlier term, or naming what you left out and what \
surprised you. Two to four sentences.

Banned, verified absent from the corpus this style is measured on: "deep \
dive", "unpack", "demystify", "let's dive in", "rock-solid", adverbial \
intensifiers (incredibly, profoundly, fundamentally, truly), bold for \
mid-sentence emphasis, meta-narration of the reader's feelings ("don't worry", \
"you're not alone"), promise-stacking before content, and any sentence that \
would survive unchanged in an article about a different topic.

Mechanics of the artifact:
- Start with a single H1: the article title.
- 1200-2500 words of body is the usual range; the material decides, never \
padding, never a hard cap that starves the idea.
- Cross-link sibling articles inline where a concept is genuinely picked up \
elsewhere, as [title](<slug>.md) using the slugs provided.
- End with a "Sources" H2 section listing the documentation pages actually \
used, as markdown links to their original URLs. Cite honestly: only pages \
whose content shaped the article.
"""


def compose_user(*, goal: str, topic_title: str, overview: str,
                 article: dict, siblings: list[dict], sources: str) -> str:
    sibling_lines = "\n".join(
        f"- {s['order']}. [{s['title']}]({s['slug']}.md) — {s['question']}"
        + (" (this article)" if s["slug"] == article["slug"] else "")
        for s in siblings
    )
    return f"""\
Knowledge base: {topic_title}
Learner's goal: {goal}
Overview of the whole knowledge base: {overview}

All articles, in reading order (for cross-linking):
{sibling_lines}

Write article {article['order']}: "{article['title']}"
Its question: {article['question']}
The mental model it installs: {article['model']}
Suggested entry angle: {article['entry']}

Documentation extracts to write from (with their source URLs):

{sources}
"""
