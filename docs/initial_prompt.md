# Codex — Coding Agent Starting Prompt

> Read this entire document before writing a single line of code or asking any questions.
> At the end of this document is a list of **open questions you must ask the user before starting**.
> Do not assume answers to those questions. Ask them first, wait for replies, then begin.

---

## 1. What is this project?

You are building a **personal knowledge base** for an AI Engineer. The working name is **Codex** (the user may rename it — ask).

This is not a note-taking app. This is not a learning platform. This is not a flashcard app. It is a **knowledge organisation and presentation system** — a place to store, connect, and beautifully present knowledge gained from reading technical books, research papers, official documentation, and high-quality tutorials.

The closest analogy is **Obsidian** — but web-native, with a structured database instead of markdown files, with explicit source provenance on every piece of knowledge, and with a presentation quality bar that Obsidian doesn't enforce.

The owner has previously built two smaller versions of this idea (`know-ml` and `know-ai` — hosted Vercel pages with AI-generated flashcards). Those projects had quality problems because content was generated on-the-fly. This new project replaces both. All knowledge is manually curated from real, trusted sources.

---

## 2. What this is NOT

Be explicit about these — they will tempt you to add features that are wrong for this project:

- **Not a learning platform.** No courses, no progress tracking, no quizzes, no streaks.
- **Not a capture-everything tool.** Quality is the constraint, not quantity. There is a draft/publish pipeline.
- **Not a social or collaborative app.** This is single-user, personal knowledge. No comments, no sharing feeds, no followers.
- **Not AI-powered (yet).** The schema must be GraphRAG-ready, but zero AI features are built in v1. No embeddings are computed, no chat interface, no suggestions. The database columns exist, stay null.
- **Not a replacement for Notion or Roam.** Those are general-purpose. This is intentionally narrow: curated technical knowledge from trusted sources.

---

## 3. Owner Profile

- **Role:** Fresher AI Engineer
- **Background:** Builds with AI/ML, reads technical AI books, follows research papers, works with PyTorch/HuggingFace ecosystem
- **Aesthetic taste:** Vercel, Apple, Linear, Obsidian. Clean, flat, minimal, modern. High typographic quality. No decorative noise.
- **Personality around tools:** Prefers simplicity over features. Simple things done well are more addictive to him than gamified systems. He does not want points, streaks, badges, or progress bars.
- **Learning approach:** Breadth-first — he prefers surface-level understanding across many topics over deep specialisation in one. This means entries tend toward clear concept explanations rather than exhaustive deep-dives. Entry granularity should be coarser, not finer.
- **Design files:** The user will provide Vercel and Apple design guide markdown files. Read them carefully before designing any UI. Treat them as authoritative over your own defaults.

---

## 4. Design Philosophy — Read This Carefully

This section is the most important for UI/UX decisions. The user has strong taste and will reject work that violates these principles.

### 4.1 The Aesthetic

The visual target is: **Vercel dashboard meets Apple documentation meets Obsidian reading experience**.

- **Flat surfaces.** No gradients, no drop shadows, no blur, no glow effects. Everything sits on clean white/off-white surfaces separated by thin borders.
- **0.5px borders.** Not 1px. Borders are whisper-thin and exist to separate, not to decorate.
- **Two font weights only.** 400 (regular) for body text. 500 (medium) for headings and labels. Never 600, never 700 — they read as heavy and loud.
- **Sentence case always.** Navigation, headings, labels, buttons — all sentence case. Never ALL CAPS for decoration. Never Title Case In Buttons.
- **Minimal color.** Color encodes meaning, not decoration. A status badge uses color to communicate state. A card does not get a colorful header just to look interesting.
- **Generous whitespace.** The reading experience should feel like a well-typeset book, not a cramped dashboard. Long-form entry reading needs comfortable line lengths (max ~72ch), good line height (1.7–1.8 for body), and vertical breathing room between sections.
- **No emoji in UI chrome.** Icons via a consistent icon library (Tabler or Lucide — ask the user). Emoji may appear in user content.
- **Transparency about state.** Draft entries look visually different from published entries. Empty states are beautiful, not apologetic.

### 4.2 Navigation Philosophy

- **Home page = Collections dashboard.** A grid/list of collections. Simple stats (total entries, published, drafts). Recently updated entries. This is the entry point.
- **Second level = Collection detail page.** A flat list of entries within a collection, with some metadata visible per row (summary preview, tags, source count, last updated). Clicking an entry opens the artifact.
- **Third level = Entry / Artifact view.** The full reading experience for a single entry. This is the most important view — get the typography and layout right here before anything else.
- **Graph view.** Accessible from the main nav, but NOT the home page. A visual force-directed graph of all entries and their typed relations. This is a navigation tool, not a gimmick. Built for later — stub it gracefully in v1 if needed.
- **Search.** Global, accessible from the nav. Full-text across titles, summaries, bodies, and tags.
- **Mobile nav.** On small screens: bottom tab bar with Home, Graph, Search, and a New Entry (+) button. No hamburger menu.

### 4.3 The Entry / Artifact Reading View

This is the centrepiece of the app. Spend the most design effort here.

Structure of an entry reading view (top to bottom):
1. **Breadcrumb** — `Collection name › Entry title`
2. **Entry header** — Title (large, 22–24px, weight 500), tags as small pills (optional), status badge
3. **Meta row** — Collection name, date added, source count, relation count (small, muted)
4. **Summary block** — Visually distinct (slightly different background, labelled "Summary"). 2–3 sentences. This is the "flashcard" version of the entry — always present.
5. **Body** — Full markdown-rendered long-form content. Good code block styling. Proper heading hierarchy. LaTeX/math rendering is desirable (ask user if required in v1).
6. **Sources section** — List of sources with type icon (Book, Paper, Docs, Tutorial), title, author, and optional chapter/page reference.
7. **Relations sidebar / section** — Grouped by relation type (Part of, Uses, Prerequisite, Contrasts with, See also). Each relation is a clickable chip that navigates to that entry.

The sidebar on desktop: Relations panel sits to the right of the body content. On mobile, it collapses below the body.

---

## 5. Tech Stack — Decided

These are not up for discussion. They have been chosen deliberately.

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js (App Router)** | Vercel-native, RSC for fast initial loads, file-based routing |
| Language | **TypeScript** | Strict mode. No `any`. |
| Database | **PostgreSQL** | Relational data with typed relations and source provenance. Hard requirement. |
| ORM | **Prisma** | Type-safe queries, clean migration workflow |
| Vector extension | **pgvector** | For future GraphRAG embeddings. Install now, use later. |
| Hosting | **Vercel** | Ask user which Postgres provider: Vercel Postgres, Neon, Supabase, or Railway |
| Styling | **Tailwind CSS** | Utility-first, pairs well with the design system |
| Component approach | Server Components by default, Client Components only where interactivity is needed |
| Package manager | **pnpm** | Ask user if they have a preference |

---

## 6. Database Schema — Finalised

This schema is locked. Do not deviate without asking. Every decision here was deliberate.

```prisma
// schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

model Collection {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  description String?
  color       String?  // hex or named token — drives card accent and graph cluster color
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  entries     Entry[]
}

model Entry {
  id           String       @id @default(uuid())
  title        String
  slug         String       @unique
  summary      String?      // 2–3 sentence distillation — this is the RAG chunk when embeddings are added
  body         String?      // full markdown content
  tags         String[]     // optional, multi-value, user-defined. NOT an enum. e.g. ["paper", "concept", "foundational"]
  status       EntryStatus  @default(DRAFT)
  collectionId String
  collection   Collection   @relation(fields: [collectionId], references: [id])
  metadata     Json?        // jsonb escape hatch — store arbitrary structured data (e.g. arxiv_id, year, venue)
  embedding    Unsupported("vector(1536)")?  // null in v1. populated when AI layer is added.
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  sources      Source[]
  relationsFrom Relation[]  @relation("RelationFrom")
  relationsTo   Relation[]  @relation("RelationTo")
}

enum EntryStatus {
  DRAFT
  PUBLISHED
}

model Source {
  id          String     @id @default(uuid())
  entryId     String
  entry       Entry      @relation(fields: [entryId], references: [id], onDelete: Cascade)
  sourceType  SourceType
  title       String
  author      String?
  url         String?
  ref         String?    // chapter, page number, section — e.g. "Chapter 3, p.47" or "Section 3.2"
  createdAt   DateTime   @default(now())
}

enum SourceType {
  BOOK
  PAPER
  DOCS
  TUTORIAL
  COURSE
  WEBSITE
}

model Relation {
  id           String       @id @default(uuid())
  fromId       String
  toId         String
  from         Entry        @relation("RelationFrom", fields: [fromId], references: [id], onDelete: Cascade)
  to           Entry        @relation("RelationTo", fields: [toId], references: [id], onDelete: Cascade)
  relationType RelationType
  note         String?      // optional annotation on the edge — e.g. "used in the context of fine-tuning"
  createdAt    DateTime     @default(now())

  @@unique([fromId, toId, relationType])
}

enum RelationType {
  PART_OF       // this entry is a component of the target
  USES          // this entry depends on / applies the target
  PREREQUISITE  // you should understand the target before this entry
  CONTRASTS     // this entry is an alternative to or differs from the target
  SEE_ALSO      // loosely related, no strong directional meaning
}
```

### Schema design decisions to respect

- **`tags` is `String[]`**, not a junction table, not an enum. Queryable with PostgreSQL `@>` operator. Add a GIN index on it: `CREATE INDEX entry_tags_gin ON "Entry" USING GIN (tags)`.
- **`summary` is separate from `body`**. It is not an auto-excerpt. It is a first-class field the user manually writes. This is the field that will be embedded for RAG. Keep them separate always.
- **`embedding` column exists but is null in v1**. Do not compute embeddings. Do not call any embedding API. The column is there so the migration doesn't need to run later on a large table.
- **`metadata` is jsonb**, not a JSONB text column. Use Prisma's `Json` type. This stores entry-specific structured data that varies by entry (e.g., for a paper entry: `{ "arxivId": "1706.03762", "year": 2017, "venue": "NeurIPS" }`).
- **`Relation` is directional** but `SEE_ALSO` is semantically bidirectional. When creating a `SEE_ALSO` relation, create both directions. For all other types, direction matters: `PREREQUISITE` means "to understand entry A, first understand entry B."
- **`onDelete: Cascade`** on Source and Relation — deleting an entry cleans up its sources and relations.

---

## 7. Application Routes & Pages

```
/                          → Home: collections dashboard
/collections/:slug         → Collection detail: flat entry list
/entries/:slug             → Entry artifact: full reading view
/entries/:slug/edit        → Entry editor (ask user: inline edit vs separate page)
/graph                     → Knowledge graph (stub in v1 if needed)
/search                    → Search results
/new                       → Quick new entry flow (ask user about this UX)
```

### 7.1 Home Page `/`

**Purpose:** A dashboard showing all collections and a "recently updated" feed.

**Layout:**
- Top nav: app name (left), nav links (Home, Graph, Search), search bar + New Entry button (right)
- Page title: "Collections"
- Stats row: 3 metric cards — Total entries, Published, Drafts
- Collections grid: `repeat(auto-fit, minmax(240px, 1fr))`, gap 10px. Each card shows: collection icon/initials, name, description, entry count, last updated. Plus a dashed "New collection" card.
- "Recently updated" section below the grid: flat list of the last 5–10 updated entries with collection dot indicator, entry title, collection name, time ago.

**Mobile:** single-column grid, bottom tab nav.

### 7.2 Collection Detail `/collections/:slug`

**Purpose:** See all entries in a collection. Navigate into an entry.

**Layout:**
- Breadcrumb: Home › Collection name
- Collection header: name, description, entry count, collection color accent
- Filter/sort bar: filter by status (All / Published / Draft), filter by tag, sort by (updated, created, title)
- **Flat list of entries.** Each row shows:
  - Entry title (bold, medium weight)
  - Summary preview (truncated to 1–2 lines, muted)
  - Tags as small pills (if any)
  - Source count (e.g. "3 sources")
  - Status badge (published/draft)
  - Last updated time
  - Right chevron or hover state to indicate it's clickable
- Clicking any row opens the entry artifact view.
- An empty state if no entries in the collection yet.

**Mobile:** same layout, each row is full-width, larger tap targets.

### 7.3 Entry Artifact View `/entries/:slug`

**Purpose:** Read a single entry beautifully. This is the most important view.

**Layout (desktop):** Two-column — main content left (~65%), relations sidebar right (~35%).

**Main content column:**
- Breadcrumb: Home › Collection › Entry title
- Type/tag badges (if any) + status badge (right-aligned in header row)
- Entry title: 22–24px, weight 500, generous line height
- Meta row: collection name · date · X sources · X relations (12px, muted)
- **Summary block:** visually distinct card/surface. Labelled "Summary" in small uppercase. The 2–3 sentence distillation. This always appears even if the body is long.
- **Body:** full markdown rendered. Good code blocks. Proper `<h2>`, `<h3>` hierarchy within entries. Line length capped at ~72ch. LaTeX rendering if the user confirms it's needed.
- **Sources section:** labelled "Sources". List of source items each showing: type icon, title, author, ref (chapter/page). URL is a link if present.

**Sidebar (desktop) / Section below body (mobile):**
- "Relations" heading
- Grouped by relation type. Each group: small label (e.g. "Prerequisite"), then chips. Each chip is the target entry title and navigates to it.

**Edit button:** An "Edit" button in the top-right area that takes you to the editor. Ask the user whether editing happens inline (same URL, toggle edit mode) or on a separate `/entries/:slug/edit` route.

### 7.4 Graph View `/graph`

**Purpose:** Visual navigation of the entire knowledge base as a force-directed graph.

- Nodes = entries, colour-coded by collection
- Edges = relations, styled by relation type
- Click a node → navigates to entry
- In v1 this can be a simple implementation. Ask the user which graph library to use (D3.js, vis.js, react-force-graph, or other).
- If graph library choice is unresolved, stub the route with a placeholder and note.

### 7.5 Search `/search`

- Full-text search across `title`, `summary`, `body`, `tags`
- Results show: entry title, collection name, summary excerpt with highlighted match, status
- Use PostgreSQL full-text search (`tsvector` / `tsquery`) in v1. Semantic search comes later with embeddings.
- Can be triggered via the nav search bar (which may live-search on type, routing to `/search?q=...`)

---

## 8. Folder Structure — Modular and Expandable

```
codex/
├── app/                          # Next.js App Router
│   ├── (home)/
│   │   └── page.tsx              # Home / collections dashboard
│   ├── collections/
│   │   └── [slug]/
│   │       └── page.tsx          # Collection detail
│   ├── entries/
│   │   └── [slug]/
│   │       ├── page.tsx          # Entry reading view
│   │       └── edit/
│   │           └── page.tsx      # Entry editor (ask user)
│   ├── graph/
│   │   └── page.tsx              # Graph view
│   ├── search/
│   │   └── page.tsx              # Search results
│   ├── api/                      # API routes
│   │   ├── collections/
│   │   ├── entries/
│   │   ├── sources/
│   │   └── relations/
│   ├── layout.tsx                # Root layout with nav
│   └── globals.css
├── components/
│   ├── ui/                       # Primitive UI components (Button, Badge, Input, etc.)
│   ├── entry/                    # Entry-specific components
│   │   ├── EntryCard.tsx         # Row item in collection list
│   │   ├── EntryArtifact.tsx     # Full reading view
│   │   ├── EntrySummary.tsx      # Summary block
│   │   ├── EntryRelations.tsx    # Relations sidebar/section
│   │   └── EntrySources.tsx      # Sources list
│   ├── collection/
│   │   ├── CollectionCard.tsx    # Grid card on home
│   │   └── CollectionHeader.tsx  # Header on collection detail page
│   ├── graph/
│   │   └── KnowledgeGraph.tsx    # Graph visualisation (client component)
│   └── layout/
│       ├── TopNav.tsx
│       ├── BottomNav.tsx         # Mobile bottom tabs
│       └── Breadcrumb.tsx
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── utils.ts                  # Shared utilities (slugify, formatDate, etc.)
│   ├── markdown.ts               # Markdown → HTML rendering config
│   └── search.ts                 # Full-text search helpers
├── prisma/
│   ├── schema.prisma             # Schema as above
│   └── migrations/               # Prisma migrations
├── types/
│   └── index.ts                  # Shared TypeScript types (can extend Prisma types)
└── public/
```

**Principles for the codebase:**
- Every feature lives in its own folder. No giant files.
- Components are small and single-purpose. A 200-line component is a signal to split.
- API routes mirror the data model: one folder per table/entity.
- `lib/db.ts` is the only place Prisma client is instantiated (singleton pattern for Next.js).
- Server Components fetch data directly via Prisma where possible. API routes are for client-side mutations.
- No business logic in components. Components receive data as props, render it.

---

## 9. GraphRAG Readiness — How to Stay Ready Without Building It

The AI layer is explicitly not being built in v1. But every decision should preserve the path to adding it cleanly. Here is what that means concretely:

1. **`embedding` column exists** in the Entry table as `vector(1536)`, nullable. It stays null. Do not add any code that references it beyond the schema definition.
2. **`summary` is a first-class field**, not auto-generated. When embeddings are added, `summary` is the chunk that gets embedded — not the full `body`. The manual quality of the summary directly determines retrieval quality later.
3. **`relationType` is an enum with semantic meaning**, not just a generic "linked". When a RAG system answers "what are the prerequisites for understanding Attention?", it traverses `PREREQUISITE` edges. The edge types make the graph queryable by semantics, not just topology.
4. **`metadata` jsonb** stores structured data that may become valuable context for RAG responses (e.g. paper year, venue, DOI).
5. **`slug`** on entries ensures stable, human-readable identifiers for citation in RAG responses.
6. Do not use UUIDs as display identifiers. Always use `slug`.

---

## 10. Key Product Decisions Already Made

Document these clearly so you don't re-open them:

| Decision | Choice | Notes |
|---|---|---|
| DB type | PostgreSQL | Hard requirement. Relational integrity for entries/sources/relations. |
| Flexible fields | JSONB on Entry | Not a separate NoSQL store — just a column escape hatch. |
| Entry types | `tags: String[]` | NOT a mandatory enum. Optional, multi-value, user-defined. "paper", "concept" etc. are just tags. |
| Draft/Publish pipeline | `status: DRAFT \| PUBLISHED` | Drafts are invisible in the main list by default (but filterable). The graph only shows published entries. |
| Home page | Collections dashboard | NOT the graph view. Collections grid + recently updated. |
| Collection detail | Flat list | Not kanban, not cards grid. A flat list of entry rows with summary preview and metadata. |
| Graph view | Secondary nav item | Important but not home. Not built in v1 if graph library choice is unresolved. |
| AI features | None in v1 | Schema is ready. No embedding computation, no AI calls, no suggestions. |
| Mobile | Bottom tab nav | Home, Graph, Search, New Entry (+). No hamburger. |
| Source provenance | First-class field | Every entry can have multiple sources. This is what differentiates this from Obsidian's model. |
| Relation types | Directed enum | PART_OF, USES, PREREQUISITE, CONTRASTS, SEE_ALSO. SEE_ALSO is bidirectional (create both directions). |

---

## 11. Aesthetic Patterns to Follow

- Use the user's provided Vercel and Apple design guide files as the primary reference. Read them before designing any page.
- Thin borders: `border: 0.5px solid` with a very low-opacity border color (not a heavy gray)
- Card radius: 8px for small elements, 12px for cards
- Collection color appears as a small accent — a colored dot or small square — not as a full card background
- Status badges: "Published" = soft green background + dark green text. "Draft" = muted gray background + gray text. No bright colors.
- Tags: small pill shape, muted background, small font (11–12px)
- The summary block inside an entry: `background: secondary surface` (slightly off-white/off-black), 1rem padding, 8px radius, labelled with a tiny "Summary" heading in 11px uppercase muted text
- Empty states: clean, minimal, not apologetic. A short sentence + an action button. No large illustrations.
- Loading states: skeleton shimmer if needed, but prefer server-side data loading (Next.js RSC) so loading states are rarely needed.
- Transitions: 150ms ease for hover states. Nothing longer. No bouncy animations.

---

## 12. Open Questions — Ask These Before Starting

Do not begin building until you have answers to every question in this list. Ask them all at once in a clear, numbered format.

1. **Project name.** The working name is "Codex". Is this the final name, or should something else be used?

2. **Database hosting.** PostgreSQL is decided. Which provider: Vercel Postgres (Neon under the hood), Neon directly, Supabase, or Railway? This affects the `DATABASE_URL` setup and Prisma configuration.

3. **Authentication.** Is this app private (only you, no auth needed for v1) or should it have auth from the start? If auth is needed, which provider: NextAuth.js, Clerk, or something else?

4. **Markdown editor.** The entry editor needs a text input for the `body` field. Three options:
   - Plain `<textarea>` with Markdown preview toggle (simplest)
   - A rich Markdown editor like **Milkdown**, **TipTap** (with Markdown extension), or **Codemirror**
   - A split-pane editor (write Markdown left, preview right)
   Which do you prefer?

5. **Math / LaTeX rendering.** Should the entry body support LaTeX rendering (e.g. `$\sum_{i=1}^{n}$` → rendered formula)? This is common for ML concepts. Requires adding KaTeX or MathJax.

6. **Graph library.** For the graph view, which library: `react-force-graph`, `d3-force`, `vis.js`, or `cytoscape.js`? Or should the graph view be deprioritised entirely in v1?

7. **Entry editor UX.** When editing an entry, should it:
   a. Open a separate `/entries/:slug/edit` page
   b. Toggle inline edit mode on the same reading view URL

8. **Icon library.** The UI needs icons throughout (nav, source types, relation types, etc.). Preference: **Tabler Icons**, **Lucide**, or **Heroicons**?

9. **New entry flow.** When creating a new entry, what is the UX?
   a. A full new-entry page `/entries/new` with all fields
   b. A quick-capture modal (just title + collection → creates a draft → edit later)
   c. Both (quick modal for fast capture, full page for detailed entry)

10. **Slug generation.** Should entry slugs be auto-generated from the title (e.g. "Attention Mechanism" → `attention-mechanism`) or manually editable?

11. **Package manager.** `pnpm`, `npm`, or `yarn`?

12. **Tailwind version.** Tailwind CSS v3 or v4?

---

## 13. What to Build First (After Questions Are Answered)

Start in this order. Do not skip ahead.

1. **Project scaffold** — Next.js + TypeScript + Tailwind + Prisma + database connection. Confirm everything connects before adding any features.
2. **Database migration** — Run the Prisma schema above. Seed with 2–3 fake collections and 5–10 fake entries across them to work against during development.
3. **Design system foundation** — Set up your `components/ui/` primitives: Button, Badge, Input, Card. These will be used everywhere. Get them right first.
4. **Home page** — Collections grid + stats + recently updated. Static layout first, then wire data.
5. **Collection detail page** — Flat entry list. Wire to real data.
6. **Entry artifact view** — The full reading experience. This is the most important page. Take your time here.
7. **Entry creation + editing** — After the reading experience is solid.
8. **Search** — PostgreSQL full-text search.
9. **Graph view** — Last, and only if the graph library question has been answered.

---

*End of prompt. Ask all open questions (Section 12) before writing any code.*
