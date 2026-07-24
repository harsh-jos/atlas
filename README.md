# Atlas

> Where curiosity becomes a knowledge base you own — arrive with a question, research the web
> with an agent, choose what earns a place, and keep it as durable linked artifacts.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=flat&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)

Atlas combines Obsidian's permanence with NotebookLM's research. You bring a question; an agent
searches the open web *and* what you already know, then proposes sources — showing you the exact
**artifacts** each would produce before anything is written. You choose. What you keep gets a
beautiful reading view (markdown, HTML, or PDF), typed **relations** to other artifacts, cited
**sources**, and a place in a **concept**. Search across everything and explore it as a graph.

> **Status:** mid-pivot. The agent loop described above is the direction, not yet the code — the
> app currently ships the pre-pivot library UI over a `Collection`/`Entry` schema. See the
> roadmap in [vision](docs/vision.md).

The vision, architecture, and design system live in [`docs/`](docs/) — [vision](docs/vision.md) ·
[architecture](docs/architecture.md) · [design](docs/design.md) ·
[learning science](docs/learning-science.md).

**Stack:** Next.js 16 (App Router, React 19, Server Components) · TypeScript · Prisma ·
PostgreSQL + pgvector · Tailwind v4 · a FastAPI + uv import service. Everything runs locally via
Docker.

---

## Running Atlas locally (Docker)

The whole stack — web app, database, and import pipeline — comes up with one command.

### Prerequisites

- **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose v2** (Linux). Nothing else.
- Make sure Docker is actually running (Docker Desktop launched) before the commands below.

### First run

```bash
git clone https://github.com/harsh-jos/atlas.git
cd atlas
cp .env.example .env
docker compose up --build
```

> ⚠️ **Port 5432 conflict (common on dev machines).** If you already run a local PostgreSQL, it
> occupies `5432` and will shadow the container. In `.env`, set **`POSTGRES_PORT=5433`** and change
> the port in **`DATABASE_URL`** to `5433` as well (`postgresql://atlas:atlas@localhost:5433/atlas`).
> This only affects the host-facing port; nothing inside Docker changes.

The **first build is slow**: the import pipeline image pulls in docling/torch (multi-GB) for PDF
parsing. Subsequent starts are fast. The web container automatically runs database migrations
(`prisma migrate deploy`, which also enables the `pgvector` extension) on every start.

When it's up:

- **App** → http://localhost:3000
- **Import pipeline health** → http://localhost:8000/healthz

Seed some sample data (optional):

```bash
docker compose exec web npm run db:seed
```

### What's running

| Service    | Image / build        | Host port | Purpose                                                        |
| ---------- | -------------------- | --------- | ------------------------------------------------------------- |
| `db`       | `pgvector/pgvector`  | 5432/5433 | PostgreSQL + pgvector. Data in the `pgdata` volume.           |
| `pipeline` | `./import-pipeline`  | 8000      | FastAPI import service. Jobs + uploads in `pipeline_data`.    |
| `web`      | `.` (Next.js)        | 3000      | The app. Runs migrations on start; uploads in `web_assets`.  |

### Everyday commands

```bash
docker compose up -d            # start in the background (add --build after code changes)
docker compose down             # stop and remove containers (KEEPS your data)
docker compose down -v          # stop AND delete all data (db, uploads, pipeline jobs)
docker compose logs -f web      # tail the web app logs (or: db, pipeline)
docker compose ps               # see status + health of each service
docker compose exec web npm run db:seed          # seed sample data
docker compose exec web npx prisma migrate deploy # apply migrations manually (runs on start anyway)
docker compose exec db psql -U atlas -d atlas    # open a psql shell
```

After changing dependencies or the Prisma schema, rebuild the web image:

```bash
docker compose up -d --build web
```

### Environment (`.env`)

`docker compose` reads `.env` for these. Inside containers, compose injects the correct
`DATABASE_URL` and `IMPORT_SERVICE_URL` itself — the `DATABASE_URL` below is only used when you run
the app/Prisma **on the host** (see next section).

| Variable              | Default                                       | Notes                                            |
| --------------------- | --------------------------------------------- | ------------------------------------------------ |
| `POSTGRES_USER`       | `atlas`                                        | Database user.                                   |
| `POSTGRES_PASSWORD`   | `atlas`                                        | Database password (local only).                  |
| `POSTGRES_DB`         | `atlas`                                        | Database name.                                   |
| `POSTGRES_PORT`       | `5432`                                         | Host port for Postgres. Use `5433` if 5432 is taken. |
| `WEB_PORT`            | `3000`                                         | Host port for the app.                           |
| `IMPORT_SERVICE_PORT` | `8000`                                         | Host port for the pipeline.                      |
| `DATABASE_URL`        | `postgresql://atlas:atlas@localhost:5432/atlas`| **Host-only** connection (match the port above). |
| `DEEPSEEK_API_KEY`    | *(empty)*                                      | Optional LLM key for future enrichment; unused today. |

### Persistent data (volumes)

Your data lives in named Docker volumes and **survives `docker compose down`**:

- `pgdata` — the PostgreSQL database.
- `web_assets` — uploaded images (served at `/assets/<id>`).
- `pipeline_data` — the import pipeline's job queue and upload staging.

`docker compose down -v` deletes all three — use it only for a clean reset.

### Develop with hot reload (optional)

To iterate on the web app with fast refresh, run only the database in Docker and the app on your
host:

```bash
docker compose up -d db      # Postgres + pgvector only
npm install
npm run db:deploy            # apply migrations
npm run dev                  # http://localhost:3000
```

The `DATABASE_URL` in `.env` points the host app at the dockerized DB (mind the 5432/5433 port).
To run the import pipeline on the host too, see [`import-pipeline/README.md`](import-pipeline/README.md).

### Troubleshooting

- **`docker compose up` fails to connect to the daemon** — Docker Desktop isn't running; start it.
- **`Ports are not available` / `address already in use`** — something holds `3000`/`5432`/`8000`.
  Change the matching `*_PORT` in `.env` (for Postgres, also update the `DATABASE_URL` port).
- **Prisma `P1010: User was denied access` when running on the host** — a native Postgres on `5432`
  is shadowing the container. Publish the container on `5433` (see the port-conflict note above).
- **Web starts before the DB is ready** — compose waits for the DB healthcheck; if it still races,
  `docker compose restart web`.
- **Full reset** — `docker compose down -v && docker compose up --build`.

---

## Project layout

```
atlas/
├── app/                  # Next.js App Router — pages + API routes (incl. /api/assets, /assets/[id])
├── components/           # UI: entry/, collection/, graph/, import/, layout/, ui/
├── lib/                  # data access, search, assets, Prisma singleton (db.ts)
├── prisma/               # schema, migrations, seed
├── import-pipeline/      # local Python ingestion service (FastAPI + uv)
├── docs/                 # vision, design system, learning-science notes
├── docker-compose.yml    # the whole local stack
└── Dockerfile            # the web image
```

## License

Personal project — all rights reserved by the author. No open-source license is currently applied.
