# Atlas — working notes for agents

Atlas is a calm, reading-first **learning home** — you arrive with a link or PDF *to learn the
concept from Atlas itself*; the reading experience is the product. Stack: Next.js 16 (App Router)
+ TypeScript (strict) + Prisma + PostgreSQL/pgvector + Tailwind v4. Server Components by default;
client components only where interactivity is genuinely needed. Moving to a Dockerized, local-first
setup (one `docker-compose` for the whole stack).

## Vision is the source of truth
`docs/vision.md` holds what Atlas is and why — product identity, roadmap, and the learning-science
foundation (`docs/learning-science.md`). **Read `docs/vision.md` before shaping any feature.** When
intent is unclear, it wins over stale code.

## This is NOT the Next.js you know
This repo runs a modified Next.js 16 with breaking changes from the public docs — APIs,
conventions, and file structure may differ from your training data. **Before writing any
Next.js code, read the relevant guide in `node_modules/next/dist/docs/`** and heed its
deprecation notices. Don't trust training-data assumptions about the App Router.

## Design
The design system and philosophy live in `docs/design.md`. Design tokens are the single
source of truth in `app/globals.css` (mapped into Tailwind `@theme`) — use them, don't
hardcode colors. `font-display` = Plus Jakarta Sans (headings/UI); the default body font is
Inter (reading). Note `bg-canvas` is white — use `surface-soft` for hover/inset tints.

## Engineering principles
From the team's engineering rulebook. These are defaults, not law — break one only for a
good, *stated* reason.

- **Optimize for the next reader.** Simple beats clever. Match the surrounding code's idiom.
- **Write the simplest thing that works (YAGNI).** Less code is better code. Don't build for
  imagined future needs; solve the problem in front of you. The best refactor makes code smaller.
- **SOLID, clean, modular, reusable.** Single responsibility, depend on abstractions not
  concretions, small focused interfaces. Prefer pure, composable functions.
- **Small, single-purpose units + clear structure.** One file/function = one responsibility; if
  you can't name it without "and", split it. No god-files. Prefer *more, smaller* files and
  functions when it improves readability, and keep a clear, predictable folder structure.
- **Single source of truth.** One home per fact/constant/mapping — derive, don't duplicate
  (duplicated data drifts). Prisma is reached only through the `lib/db.ts` singleton.
- **Fail loud, never silent.** Distinguish "no result" (correct) from "failure" (a bug);
  never fabricate an empty-but-successful result. Report truncation, don't hide it.
- **Parse at the boundary; trust the interior.** Convert external input/responses into typed
  models once. Type public signatures. No `any`; don't lie in types.
- **No magic literals.** Meaningful numbers/strings become named constants.
- **DRY by the rule of three.** Extract a helper on the third repetition, not the first. A
  good refactor usually makes the code smaller.
- **No comments unless necessary.** Prefer self-documenting names over narration; add a comment
  only when the *why* isn't obvious from the code. Delete dead code — git remembers.
- **Verify against reality, not docs.** Docs and AI explanations go stale; confirm behavior
  live when it matters.
- **Gate every change.** Run the type-checker (and lint) after each change, not at the end.
  Keep each commit building and coherent — never leave a broken intermediate state. Refactor
  as its own named step, not bolted onto a feature.
