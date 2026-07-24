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

> **Status:** mid-pivot. The backend, the agent, and the curation loop are built; the frontend
> reads them but is still the pre-pivot library UI, and there is no chat surface yet. Manual
> editing is temporarily gone with the Prisma routes that powered it. See the
> roadmap in [vision](docs/vision.md).

The vision, architecture, and design system live in [`docs/`](docs/) — [vision](docs/vision.md) ·
[architecture](docs/architecture.md) · [design](docs/design.md) ·
[learning science](docs/learning-science.md).

**Stack:** Next.js 16 (App Router, React 19, Server Components) · TypeScript · Tailwind v4 for the
frontend, and a Python backend (FastAPI + SQLAlchemy + Alembic + uv) that owns the database, the
ingestion pipeline and the Google ADK agent. PostgreSQL + pgvector underneath. The frontend holds
no database connection — it reads the backend's HTTP API. Everything runs locally via Docker.

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
parsing. Subsequent starts are fast. The backend container automatically runs database migrations
(`alembic upgrade head`, which also enables the `pgvector` extension) on every start.

When it's up:

- **App** → http://localhost:3000
- **Import pipeline health** → http://localhost:8000/healthz

### What's running

| Service    | Image / build        | Host port | Purpose                                                        |
| ---------- | -------------------- | --------- | ------------------------------------------------------------- |
| `db`       | `pgvector/pgvector`  | 5432/5433 | PostgreSQL + pgvector. Data in the `pgdata` volume.           |
| `pipeline` | `./backend`          | 8000      | The Python backend: API, pipeline, agent. Jobs + uploads in `pipeline_data`. |
| `web`      | `.` (Next.js)        | 3000      | The app. Holds no database connection — reads the backend API. |

### Everyday commands

```bash
docker compose up -d            # start in the background (add --build after code changes)
docker compose down             # stop and remove containers (KEEPS your data)
docker compose down -v          # stop AND delete all data (db, uploads, pipeline jobs)
docker compose logs -f web      # tail the web app logs (or: db, pipeline)
docker compose ps               # see status + health of each service
docker compose exec pipeline uv run alembic upgrade head  # apply migrations manually
docker compose exec db psql -U atlas -d atlas    # open a psql shell
```

After changing dependencies, rebuild the image:

```bash
docker compose up -d --build web
```

### Environment (`.env`)

`docker compose` reads `.env` for these. Inside containers, compose injects `DATABASE_URL` (backend)
and `ATLAS_API_URL` (frontend) itself — the `DATABASE_URL` below is only used when you run the
backend **on the host** (see next section).

| Variable              | Default                                       | Notes                                            |
| --------------------- | --------------------------------------------- | ------------------------------------------------ |
| `POSTGRES_USER`       | `atlas`                                        | Database user.                                   |
| `POSTGRES_PASSWORD`   | `atlas`                                        | Database password (local only).                  |
| `POSTGRES_DB`         | `atlas`                                        | Database name.                                   |
| `POSTGRES_PORT`       | `5432`                                         | Host port for Postgres. Use `5433` if 5432 is taken. |
| `WEB_PORT`            | `3000`                                         | Host port for the app.                           |
| `IMPORT_SERVICE_PORT` | `8000`                                         | Host port for the pipeline.                      |
| `DATABASE_URL`        | `postgresql://atlas:atlas@localhost:5432/atlas`| **Host-only** connection (match the port above). |
| `JWT_SECRET`          | *(required)*                                   | Signs access tokens. The backend refuses to boot without it. |
| `VERTEX_PROJECT`      | *(empty)*                                      | Google Cloud project; enables the agent. Credentials come from ADC. |
| `ATLAS_API_URL`       | `http://localhost:8000`                        | Where the frontend finds the backend (host runs only).  |

### Persistent data (volumes)

Your data lives in named Docker volumes and **survives `docker compose down`**:

- `pgdata` — the PostgreSQL database.
- `pipeline_data` — the import pipeline's job queue and upload staging.

`docker compose down -v` deletes all three — use it only for a clean reset.

### Develop with hot reload (optional)

To iterate on the web app with fast refresh, run only the database in Docker and the app on your
host:

```bash
docker compose up -d db                                   # Postgres + pgvector only
cd backend && uv sync && uv run alembic upgrade head      # backend deps + schema
uv run uvicorn app.main:app --port 8000                   # the API, agent and pipeline
cd .. && npm install && npm run dev                       # http://localhost:3000
```

`DATABASE_URL` points the backend at the dockerized DB (mind the 5432/5433 port), and
`ATLAS_API_URL` points the frontend at the backend. See [`backend/README.md`](backend/README.md).

### Troubleshooting

- **`docker compose up` fails to connect to the daemon** — Docker Desktop isn't running; start it.
- **`Ports are not available` / `address already in use`** — something holds `3000`/`5432`/`8000`.
  Change the matching `*_PORT` in `.env` (for Postgres, also update the `DATABASE_URL` port).
- **`password authentication failed` when running on the host** — a native Postgres on `5432` is
  shadowing the container. Publish the container on `5433` (see the port-conflict note above).
- **Web starts before the DB is ready** — compose waits for the DB healthcheck; if it still races,
  `docker compose restart web`.
- **Full reset** — `docker compose down -v && docker compose up --build`.

---

## Project layout

```
atlas/
├── app/                  # Next.js App Router — pages only, no database access
├── components/           # UI: entry/, collection/, graph/, layout/, ui/, auth/
├── lib/                  # api.ts (the backend client), api-types.ts, utils
├── backend/              # the Python backend
│   └── app/              #   agent/ · api/ · auth/ · db/ · pipeline/ · jobs/ · realtime/ · storage/
├── docs/                 # vision, architecture, feature catalog, design system
├── docker-compose.yml    # the whole local stack
└── Dockerfile            # the web image
```

## License

Personal project — all rights reserved by the author. No open-source license is currently applied.
