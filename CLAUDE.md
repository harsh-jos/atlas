# Atlas — working notes for agents

Atlas is a personal knowledge base: a calm, reading-first "learning home." Stack: Next.js 16
(App Router) + TypeScript (strict) + Prisma + PostgreSQL/pgvector + Tailwind v4. Server
Components by default; client components only where interactivity is genuinely needed.

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
- **Small, single-purpose units.** One file/function = one responsibility; if you can't name
  it without "and", split it. No god-files.
- **Single source of truth.** One home per fact/constant/mapping — derive, don't duplicate
  (duplicated data drifts). Prisma is reached only through the `lib/db.ts` singleton.
- **Fail loud, never silent.** Distinguish "no result" (correct) from "failure" (a bug);
  never fabricate an empty-but-successful result. Report truncation, don't hide it.
- **Parse at the boundary; trust the interior.** Convert external input/responses into typed
  models once. Type public signatures. No `any`; don't lie in types.
- **No magic literals.** Meaningful numbers/strings become named constants.
- **DRY by the rule of three.** Extract a helper on the third repetition, not the first. A
  good refactor usually makes the code smaller.
- **Comments explain *why*, not *what*.** Delete dead code — git remembers.
- **Verify against reality, not docs.** Docs and AI explanations go stale; confirm behavior
  live when it matters.
- **Gate every change.** Run the type-checker (and lint) after each change, not at the end.
  Keep each commit building and coherent — never leave a broken intermediate state. Refactor
  as its own named step, not bolted onto a feature.
