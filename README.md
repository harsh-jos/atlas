# Atlas

> A calm, reading-first personal knowledge base — collect technical knowledge with explicit sources and typed relations, then read and explore it like a book.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-087EA4?style=flat&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=flat&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)

Atlas turns books, papers, documentation, and tutorials into a connected library. Every
entry keeps its **source provenance**, links to related entries through **typed relations**,
and lives in a **collection**. Read entries in a clean, book-like view; search across
everything; and explore the connections as an interactive graph.

A companion **import pipeline** ingests whole documentation sites, articles, PDFs, and
markdown — splitting each source into linked entries automatically.

## Features

- **Collections** — a quiet "library shelf" home; group entries and give each shelf a color.
- **Reading view** — a single centered column with sources and related entries kept as quiet
  back-matter at the end, like a real book. Includes a reading-progress indicator and inline
  Markdown/LaTeX rendering.
- **Source provenance** — every entry cites where it came from (book, paper, docs, tutorial,
  course, or website) with author, URL, and a precise reference (chapter, page, section).
- **Typed relations** — connect entries with meaning: `PART_OF`, `USES`, `PREREQUISITE`,
  `CONTRASTS`, and `SEE_ALSO`. Incoming relations are shown with their inverse label.
- **Knowledge graph** — an interactive force-directed view of entries and the relations
  between them, colored by collection.
- **Full-text search** — weighted PostgreSQL search across titles, summaries, bodies, and
  tags.
- **Inline editing** — edit an entry, its sources, and its relations in place, with a
  server-backed typeahead for picking relation targets.
- **Embeddings-ready schema** — entries reserve a `pgvector` column for a future
  semantic/RAG layer (unused in v1).

## Tech stack

| Area       | Choice                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| Framework  | [Next.js 16](https://nextjs.org/) (App Router, React 19, Server Components)|
| Language   | TypeScript (strict)                                                        |
| Database   | PostgreSQL + [pgvector](https://github.com/pgvector/pgvector)              |
| ORM        | [Prisma](https://www.prisma.io/)                                          |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com/) with design tokens            |
| Editor     | [CodeMirror](https://codemirror.net/) (Markdown)                          |
| Graph      | [react-force-graph](https://github.com/vasturiano/react-force-graph)      |
| Content    | react-markdown · remark-gfm · KaTeX                                       |
| Import svc | Python · [FastAPI](https://fastapi.tiangolo.com/) · [uv](https://docs.astral.sh/uv/) |

## Getting started

### Prerequisites

- **Node.js 20+**
- A **PostgreSQL** database with the `pgvector` extension available — e.g.
  [Neon](https://neon.tech), [Supabase](https://supabase.com), Vercel Postgres, or local
  Postgres.

### Setup

```bash
git clone https://github.com/harsh-jos/atlas.git
cd atlas

cp .env.example .env    # then set DATABASE_URL
npm install
npm run db:deploy       # apply migrations
npm run db:seed         # seed sample data (optional)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Tip:** if pages feel slow, prefer a *pooled* connection string (e.g. Neon's `-pooler`
> endpoint). Most per-request latency comes from establishing connections to a remote
> serverless database, not from rendering.

### Importing content (optional)

The import pipeline is a separate local Python service that writes into the same database.
See [`import-pipeline/README.md`](import-pipeline/README.md) for setup and usage. In short:

```bash
cd import-pipeline
cp .env.example .env    # point DATABASE_URL at the same DB as the app
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then use the **Import** page in the app to bring in a documentation site, article, PDF, or
markdown.

## Project structure

```
atlas/
├── app/                  # Next.js App Router — pages and API routes
│   ├── collections/      # collection detail (sort, tag filter, pagination)
│   ├── entries/          # entry reading view + inline editor
│   ├── graph/            # knowledge graph
│   ├── search/           # full-text search
│   ├── import/           # import UI
│   └── api/              # route handlers (entries, collections, imports, search)
├── components/           # UI: collection/, entry/, graph/, import/, layout/, ui/
├── lib/                  # data access, search, utils, Prisma singleton (db.ts)
├── prisma/               # schema, migrations, seed
├── import-pipeline/      # local Python ingestion service (FastAPI)
└── docs/                 # design system & philosophy
```

## Data model

| Model        | Purpose                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| `Collection` | A named, colored group of entries.                                            |
| `Entry`      | A unit of knowledge: title, summary, Markdown body, tags, and JSON metadata.  |
| `Source`     | Where an entry came from — type, author, URL, and a precise reference.        |
| `Relation`   | A typed, optionally annotated edge between two entries.                        |

Entries also carry a nullable `vector(1536)` embedding column, reserved for a future AI
layer. See [`prisma/schema.prisma`](prisma/schema.prisma) for the full schema.

## Scripts

| Command               | Description                              |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | Start the development server.            |
| `npm run build`       | Generate the Prisma client and build.    |
| `npm run start`       | Start the production server.             |
| `npm run lint`        | Run ESLint.                              |
| `npm run db:migrate`  | Create and apply a development migration.|
| `npm run db:deploy`   | Apply pending migrations.                |
| `npm run db:generate` | Regenerate the Prisma client.            |
| `npm run db:seed`     | Seed sample data.                        |

## Design

Atlas is an inward-facing learning home — optimized for opening and reading, not for
displaying what you know: calm, browsing-first, and book-like. Design tokens are the single
source of truth in `app/globals.css` (mapped into Tailwind's `@theme`); type is Plus Jakarta
Sans for display/UI and Inter for reading. The full design system and philosophy live in
[`docs/design.md`](docs/design.md).

## License

This is a personal project. No open-source license is currently applied — all rights
reserved by the author.
