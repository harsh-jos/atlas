# Atlas

A personal knowledge base for curated technical knowledge — books, papers, docs, and
tutorials — with explicit source provenance and typed relations between entries. Organise
entries into collections, read them in a clean reading view, and explore their connections
as a graph.

Built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL (with the `pgvector`
extension), styled with Tailwind CSS.

## Running locally

You'll need Node.js and a PostgreSQL database with the `pgvector` extension available
(e.g. [Neon](https://neon.tech), Supabase, or local Postgres).

```bash
cp .env.example .env   # then set DATABASE_URL
npm install
npm run db:deploy      # apply migrations
npm run db:seed        # seed sample data (optional)
npm run dev
```

Open http://localhost:3000.
