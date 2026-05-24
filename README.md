# Atlas

A personal knowledge base for curated technical knowledge — books, papers, docs, and
tutorials — with explicit source provenance and typed relations between entries. Built to a
Vercel/Apple/Obsidian aesthetic: flat surfaces, thin borders, generous typography.

The schema is GraphRAG-ready (a nullable `embedding vector(1536)` column, first-class
`summary` field, semantic relation types), but no AI features are built in v1.

## Stack

- **Next.js** (App Router, RSC) + **TypeScript**
- **PostgreSQL** + **Prisma**, with the **pgvector** extension
- **Tailwind CSS v4**
- Markdown via `react-markdown` + `remark-gfm`, math via **KaTeX**
- Graph view via `react-force-graph-2d`

## Getting started

1. Copy the env template and set your database URL (any Postgres with `pgvector` available):

   ```bash
   cp .env.example .env
   # edit DATABASE_URL
   ```

2. Install dependencies and set up the database:

   ```bash
   npm install
   npm run db:deploy   # apply migrations
   npm run db:seed     # seed sample collections, entries, sources, relations
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create + apply a migration in dev |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:seed` | Reseed the database (clears existing data) |

## Routes

| Route | View |
|---|---|
| `/` | Collections dashboard + recently updated |
| `/collections/[slug]` | Entries in a collection (filter/sort) |
| `/entries/[slug]` | Entry reading view (summary, body, sources, relations) |
| `/entries/[slug]?edit=true` | Inline editor |
| `/graph` | Force-directed graph of published entries |
| `/search?q=` | Full-text search (Postgres `tsvector`) |
