# Atlas — design system & philosophy

> **About this doc:** the creator has good taste but finds it hard to put into words. So this
> is *an attempt* to pin the design down — it may be incomplete or wrong in places. When in
> doubt, favour what feels calm and reads well over what this doc literally says.

## Philosophy

Atlas is an **inward-facing learning home** — not a productivity tool, not a showcase. It is
optimized for *opening and reading*, not for displaying what you know.

- **Calm and browsing-first.** Structure gets out of the way. No dashboards, no metrics, no
  streaks.
- **Reading-first, book-like.** The reading view is the centerpiece — a single centered
  column, generous type, and the apparatus (sources, related links) kept as quiet
  back-matter at the end, like a real book.
- **Confident, not anemic.** Restraint is not timidity. Bold, tightly-tracked headlines and a
  strong type hierarchy carry the design; minimalism should never read as washed-out.
- **Feels like an object, not a webpage.** Low chrome. The content is the hero.

## Visual system

ClickUp-derived, adapted for reading. Tokens are the single source of truth in
`app/globals.css` (mapped into Tailwind `@theme`) — use them, don't hardcode colors.

- **Type.** Plus Jakarta Sans for display/UI (the `font-display` utility, weights up to 800,
  tight negative tracking on large headings). Inter for body and long-form reading (~18px,
  ~1.75 line height). Geist Mono for code.
- **Color.** White canvas; paper `#f8f9fa` for insets (summary block, code); cloud `#e8e8e8`
  hairlines. Text descends midnight ink `#090c1d` → slate `#646464` → steel `#7c828d`. A
  single **violet `#7b68ee`** signature, used *sparingly* (links, focus rings, brand).
  Primary buttons are neutral **carbon `#202023`** — violet is reserved for brand moments
  (the `Button` `brand` variant).
- **Shape & depth.** Cards/inputs 12px radius, buttons 9px, tag pills fully round. Only soft
  blue-tinted micro-shadows (`.shadow-card`) — never dramatic elevation. Cards lift off the
  white canvas via a hairline plus a faint shadow.

## Don'ts

- Don't bring dashboards/metrics or dense, SaaS-cockpit layouts into the reading flow.
- Don't use violet as a generic button fill (carbon does that); don't add new accent colors.
- Remember `bg-canvas` is white — use `surface-soft` for hover and inset tints.
