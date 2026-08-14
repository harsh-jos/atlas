# Atlas — design system

> **About this doc:** the intent behind the tokens. Values live in `app/globals.css`
> (`:root` + Tailwind `@theme`) and win over any number written here; this doc governs
> *how to use them*. Rebuilt 2026-08-08 from scratch — light mode only.

## Philosophy

**Reduction is the design.** Atlas borrows from the Apple/Vercel school: near-white ground,
near-black ink, a handful of grays, and one accent that only ever means "interactive".
Nothing decorative, no gradients on chrome, no dark mode. If a surface looks designed,
remove things until it merely looks *correct* — the calm is the brand, and the reading
is the product.

Three rules resolve most decisions:

1. **Gray first.** New UI starts as ink on white with hairline borders. Color enters only
   as the accent (interactive), a semantic tint (state), or artwork inside a card — never
   as chrome.
2. **Borders, not shadows.** Cards are drawn with a hairline plus at most a whisper of
   shadow (`shadow-card`). Real elevation (`shadow-pop`) is reserved for things that
   genuinely float: menus, dialogs.
3. **One way to do each thing.** One focus ring (`.focus-ring`), one hover tint
   (`surface-soft`), one texture (`.dot-grid`), one accent. Consistency is what makes a
   small system feel finished.

## Color

| Token | Role |
|---|---|
| `canvas` | App ground: sidebar, backdrop wells. `#fafafa`. |
| `surface` | Content, cards, inputs. Pure white. |
| `surface-soft` | The one inset tint: hover rows, code blocks, empty wells. |
| `ink` / `muted` / `faint` | Text hierarchy: primary → secondary → placeholder. Three steps, no more. |
| `hairline` / `hairline-strong` | Borders and dividers. `border` alone renders `hairline` (set globally). |
| `accent` (+`-soft`, `-line`) | One blue. Links, focus rings, active nav, selected states. **Never a button fill.** |
| `action` (+`-hover`) | Carbon. Primary buttons are black. |
| `success` / `warning` / `danger` (+`-soft`, `-line`) | State only, rendered as soft tinted pills or notices: text on `-soft` bg with `-line` border. |

Adding a color to this table is a design decision, not a convenience — argue for it in a PR.

## Type

Two families, loaded in `app/layout.tsx`:

- **Inter** (`font-sans`, the default) — everything: UI, headings, reading.
- **Geist Mono** (`font-mono`) — code, IDs, keyboard hints, and micro-labels.

The scale (Tailwind utilities, no custom tokens):

| Use | Recipe |
|---|---|
| Page title | `text-2xl font-semibold tracking-[-0.02em]` |
| Section title | `text-lg font-semibold tracking-[-0.01em]` |
| Card title / row title | `text-sm font-medium text-ink` |
| UI body | `text-sm text-ink` (secondary: `text-muted`) |
| Small / meta | `text-[13px] text-muted`, timestamps `text-faint` |
| Caption | `text-xs text-muted` |
| Micro-label (section header) | `font-mono text-[11px] uppercase tracking-[0.08em] text-faint` |
| Reading body (artifacts) | `text-[17px] leading-[1.7]`, measure ~68ch, headings step down from `text-2xl` |

Weights: 400 default, 500 for emphasis and titles-in-rows, 600 for headings and buttons.
Nothing above 600.

## Space, radius, elevation

- **Spacing:** 4px grid. Page gutters 24–32px; cards pad 16–20px; related things 8px apart,
  separate things 24px+.
- **Radius:** cards and wells `rounded-card` (12px), inputs `rounded-field` (10px),
  **buttons and pills are fully round** (`rounded-full`), avatars/icon chips 8px.
- **Elevation:** `shadow-card` (whisper) on cards; `shadow-card-hover` on interactive cards'
  hover; `shadow-pop` on menus/dialogs. Nothing else casts shadow.

## Core recipes

- **Primary button** — carbon pill: `rounded-full bg-action text-white hover:bg-action-hover`,
  `h-9 px-4 text-sm font-medium` (small: `h-8 px-3.5 text-[13px]`).
- **Secondary button** — white pill with hairline: `rounded-full border bg-surface
  hover:bg-surface-soft`.
- **Ghost button** — `rounded-full text-muted hover:bg-surface-soft hover:text-ink`.
- **Destructive** — ghost or secondary in `danger` text; never a red fill.
- **Input** — `rounded-field border border-hairline-strong bg-surface px-3 text-sm
  placeholder:text-faint`, focus via `.focus-ring`.
- **Card** — `rounded-card border bg-surface shadow-card`; interactive cards add
  `transition-shadow hover:shadow-card-hover`.
- **Status pill** — `rounded-full border px-2 py-0.5 text-xs font-medium` in one semantic
  triad, e.g. `border-success-line bg-success-soft text-success`.
- **Nav row** — `h-8 rounded-[8px] px-2.5 text-sm`; active = `bg-surface border shadow-card
  text-ink font-medium` on the canvas sidebar; inactive = `text-muted hover:bg-surface-soft`.
- **Empty state** — centered in a `dot-grid` well: icon chip, one-line what, one-line how,
  optionally one primary action.

## The app frame

A plain, full-viewport split: a `canvas`-tinted rail (`--rail-width`) with a hairline
divider, and a white content region. **The window never scrolls** — `<main>` is the scroll
container (`.scroll-region`); use `h-full`/`sticky`, never `h-screen`/`fixed`, for in-app
chrome. `/login` renders without the frame. Every page opens the same way: a page title, one
line of intent, actions on the right.

## Motion

Fades and small translations only: `--dur-fast` (120ms) for hovers, `--dur` (200ms) for
content entering (`.animate-rise`). Nothing bounces, nothing celebrates, and everything
respects `prefers-reduced-motion`.

## Don'ts

- No dark mode, no theme switching.
- No gradients, glows, or tinted auras on UI chrome; imagery lives *inside* cards.
- No accent-filled buttons; carbon owns primary actions.
- No new fonts, no new grays, no fourth semantic color.
- No dense dashboard layouts in the reading flow; artifacts read like documents,
  not consoles.
