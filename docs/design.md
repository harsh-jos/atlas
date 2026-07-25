# Atlas — design system & philosophy

> **About this doc:** the creator has strong visual taste but finds it hard to put into words, so
> this is derived from the inspiration he actually chose — the screenshots in `docs/design-taste/`
> (local-only, gitignored). When this doc and a token disagree, the tokens in `app/globals.css`
> win for values; this doc governs *intent*. When in doubt, favour what feels **calm, editorial,
> and premium** over what is merely minimal.
>
> **Note (2026-07):** the earlier version of this doc was stale. The `ml_flashcards.html` prototype
> in the taste folder is **not** the creator's taste — ignore its gradients, colour pills, and
> playful/gamified feel. The screenshots below are the truth.

## The one-line read

**Quiet-luxury editorial, in the register of a premium AI-research journal.** Light and airy,
confident type, generative data-viz art for the hero moments, and near-monochrome restraint with
colour used only where it *means* something. Calm and reading-first — an object, not a webpage.

## The reference library (`docs/design-taste/`)

Each shot below is here for a specific reason — steal the named quality, not the whole thing.

- **`meridian-onboarding-form.jpeg`** — *the product-surface gold standard.* A very light warm-grey
  page with one large white rounded container (~20px radius) floating on it under a soft, low
  shadow. Hairline-bordered sub-cards; a quiet vertical stepper (filled green check = done, green
  ring = active, hollow grey = upcoming); semantic status pills in soft tints (green "Verified",
  amber "Action needed", blue "In progress"); grey helper text under every label; keyboard hints
  (`esc`); dashed margin guides; "…" overflow menus; avatar initials in rounded squares. This is
  how Atlas's chrome, forms, and list rows should feel.
- **`neural-node-inspector.png`** — *the soul of the brand.* Tall soft cards on a faint halftone
  ground. **Editorial serif headlines** ("Real-time cognitive processing. Visualizing active neural
  pathways…") paired with **monospace micro-labels** ("Node Inspector", "Neural Mapping") and a
  **generative blue-violet particle cloud** standing in for a knowledge/embedding graph. This is the
  aesthetic Atlas's graph view and hero moments should aspire to.
- **`pick-your-plan-serif.png`** — *the display voice.* A high-contrast editorial serif for the big
  "Pick your Plan" title; a soft segmented pill toggle; iridescent 3D gradient renders used as
  *imagery inside cards* (never as UI chrome); muted centred captions; generous radii and
  whitespace. Apple-grade restraint.
- **`editorial-poster-halftone.png`** — *the type pairing + a signature texture.* A transitional
  serif headline ("Engineering Systems That Think Clearly.") beside bold grotesk sans ("Turning
  Complexity into Usable Systems."), with **halftone dot-matrix** topographic texture as art. Serif
  for gravitas, grotesk for punch, dots for texture.
- **`kraft-context-marketing.png`** — *on-theme product (a context/memory tool).* Soft rounded
  feature cards, a single bold gradient hero card used sparingly, a tidy grid of integration icons,
  small colour-coded feature icons. Confident but calm.
- **`investor-profile-card.png`** — *the info-card pattern.* A clean white card: header label,
  avatar, name + verified tick, structured key-value inset ("Past Company", "School"), an "AI
  Summary" block in grey, then a **carbon/black filled primary button** next to a **white outline
  secondary**. This is the button hierarchy and the structured-entity card for Atlas.
- **`clickup-settings-sidebar.jpeg`** — *navigation.* Light sidebar, line icons with small colour
  accents, count pills (filled dark vs. hollow), a subtly-filled selected row. Calm information
  density.
- **`nova-notes-app.png`** — *a notes/second-brain peer.* Minimal left panel, per-project colour
  dots (Research red, Launch blue, Finance green), colour-picker chips, a small carbon "Add"
  button, gentle empty states. Colour used as quiet categorisation.
- **`agent-hub-dashboard.png`** — *restrained data display.* Stat counters and an activity table
  with small semantic status chips — data shown without a cockpit feeling.
- **`ai-support-login-split.png`** — *entry moment.* Split layout: a deep, silky blue gradient
  panel on one side, a clean white form (carbon "Sign In", outline social buttons) on the other.

## Visual system

Tokens are the single source of truth in `app/globals.css` (mapped into Tailwind `@theme`) — use
them, don't hardcode colours.

### The app frame *(added 2026-07-25)*
Atlas is **one floating object**, not a stack of page chrome. A rounded container
(`--frame-radius`, inset by `--frame-inset`) floats on a backdrop a shade deeper than the canvas,
holding a **white left rail** (`--rail-width`) beside a single scrolling content region tinted
`canvas`. White cards float on that tint. Consequences to respect:

- The **window does not scroll** — `<main>` is the scroll container. Never use `h-screen`,
  `100vh`, or `fixed` positioning for in-app chrome; use `h-full`, `sticky`, or `absolute`.
- `/login` renders **without** the frame — it owns the viewport (the split entry moment).
- Page structure is shared: `PageHeader` (mono eyebrow → display title → one line of intent →
  actions) inside `PageContainer`. Every route opens the same way; that consistency *is* the
  finished-product feeling.
- One focus treatment everywhere: the `.focus-ring` utility. Don't hand-roll focus rings.

### Canvas & surfaces
Light and airy. A near-white / very-light warm-grey page; content lives in **white cards that float
as clean objects** — hairline border **plus** a soft, low, diffuse shadow (never dramatic
elevation). Large containers read at ~16–20px radius, inner cards/inputs ~12px, buttons ~9–10px,
pills fully round. Generous whitespace is part of the design, not a lack of content. `bg-canvas` is
effectively white — use `surface-soft` for hover and inset tints.

### Type — the voice system *(decided live, 2026-07)*
The references leaned editorial-serif for titles, but tried live the creator preferred a **clean
sans** everywhere. Serif was rejected. The decided system (tokens in `app/globals.css`):

1. **Geist — titles & display** (`font-title` → `--title`). Headings, entry titles, hero moments.
   A modern neo-grotesk: confident and clean, not literary. This is the display voice.
2. **System Helvetica/Arial — reading body** (`font-reading` → `--reading`). Long-form entry bodies
   (~18px, ~1.75 line-height). Chosen by eye over Inter/Geist/Poppins.
3. **Inter — UI default**, **Plus Jakarta Sans — UI chrome** (`font-display`) for nav, buttons,
   labels, metadata, chips.
4. **Geist Mono — technical accent** (`font-mono`) for code, micro-labels, tags, keyboard hints, IDs.

Both `--title` and `--reading` are plain, overridable properties so a **reading/title-font switcher
in app settings** can be added later without touching components. Don't mix faces within one view.

### Colour & status
Near-monochrome by default: ink descending from near-black → slate → steel on white/light-grey.
**One brand accent** in the blue-violet family (current violet `#7b68ee` fits the research-shot
palette) — used for links, focus rings, brand marks, and *generative art*, not as a generic fill.
A small, meaningful **semantic status system** rendered as soft tinted pills:

- **green** — success / verified / mastered
- **amber** — warning / action needed
- **blue** — info / in progress

Per-collection **category colours** appear as quiet dots and graph-cluster tints (as in Nova /
ClickUp), never as loud backgrounds.

### Buttons
**Primary = carbon/black filled** (~9–10px radius or pill). **Secondary = white with a hairline
border.** Tertiary = quiet ghost. Never gradient-filled buttons; the signature accent does not
become button chrome.

### Signature motifs *(new — this is what makes Atlas *Atlas*)*
- **Generative data-viz art** — blue-violet particle clouds / point fields / soft ink blotches
  representing neural pathways, latent space, and — for Atlas — the **knowledge graph itself**. The
  graph view is the natural home for this; render it as a beautiful particle field, not a boxy
  node-diagram. Reserve for graph, hero, and empty-state moments.
- **Halftone / dot-matrix texture** — faint dotted grounds and topographic dot fields as background
  texture and art. A recurring, restrained motif.
- **Iridescent/tactile gradient renders** — allowed only as *imagery inside cards* (à la Pick-your-
  Plan), never on UI chrome.

### Motion & micro-details
Motion is **subtle and premium** — gentle fades and soft hovers, never bouncy or celebratory (no
confetti, no flashy flips). Sweat the details the references sweat: keyboard hints (`esc`, `/`),
dashed layout guides, "…" overflow menus, avatar initials in rounded squares, refined empty states,
and mono micro-labels above serif headings.

## Don'ts

- Don't bring dashboards/metrics/streaks or dense SaaS-cockpit layouts into the reading flow.
- Don't treat `ml_flashcards.html` as a target: no rainbow category/difficulty pills, no
  gradient text, no gradient buttons, no confetti or gamified celebration.
- Don't use the accent as a generic button fill (carbon does that); don't add new accent colours
  beyond the one brand accent + the three semantic statuses.
- Don't let motion get playful. Calm and confident is the whole brand.
- Remember `bg-canvas` is white — use `surface-soft` for hover and inset tints.
