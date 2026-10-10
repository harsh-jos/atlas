# Atlas

Explore a subject with expert guidance. Keep useful explanations, see connections,
and return when curiosity brings you back.

[Purpose and v0.1 feature list](docs/product.md) is the only product plan.
The app is a development scaffold. The new learning loop is not complete.

## Local development

The stack is Next.js, a Python FastAPI backend with Google ADK, and PostgreSQL with pgvector.

1. Copy `.env.example` to `.env` and set a random `JWT_SECRET`.
2. Start Docker, then run `docker compose up --build`.
3. Open http://localhost:3000. The backend health endpoint is http://localhost:8000/healthz.

The agent needs `VERTEX_PROJECT` and Google Application Default Credentials available to the
backend process. For a local service-account file, set `GOOGLE_APPLICATION_CREDENTIALS`
to its absolute path in `backend/.env`. Keep the JSON outside the repo.
Enable the Vertex AI API in that project, with billing and model access available.
The service account needs permission to call Vertex AI; it may not have permission to enable APIs.
Compose does not mount host credentials. For local agent work, run the backend
on the host with ADC configured. Run `docker compose up -d db`, then, from `backend/`, copy
`.env.example` to `.env`, set the values, and run:

```sh
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000
```

From the repo root, run `npm install` and `npm run dev` for the frontend.
If port 5432 is occupied, change `POSTGRES_PORT` and the host `DATABASE_URL` port together.
Data survives `docker compose down`. Adding `-v` deletes stored data.

## Checks

```sh
npx tsc --noEmit
npm run lint
npm run build
cd backend
uv run ruff check app tests
uv run pytest
```

Database tests use a dedicated `atlas_test` database, which they replace. They skip when
PostgreSQL is unavailable. Never point tests at a shared server with an existing `atlas_test` database.

## Agent development

Apply migrations with `uv run alembic upgrade head` from `backend/` before running the agent.
The default is `gemini-3.1-pro-preview` on Vertex AI, with high reasoning. Both the guide and
research tool use it. Override `AGENT_MODEL` and `AGENT_SEARCH_MODEL` when needed. The model is
in preview; project access is required. No cheaper model is selected automatically.

The backend environment example lists the request, research, output, context-size, and time
limits. SDK retries are disabled so hidden retries do not bypass request accounting.
`GET /agent/chat/{session_id}/usage` returns owned counts, including requests with unknown usage.
Research-request limits count grounded model requests, not Google's internal search queries.
Actual query and token counts come from provider metadata. No hard currency cap is implemented.

Offline agent tests run with `uv run pytest tests/test_agent_usage.py tests/test_learning_agent.py`
from `backend/`. They use the real ADK runner with scripted models and make no cloud calls.
For a live behaviour check, start the backend and set `ATLAS_EVAL_TOKEN` in your shell to a token
for a dedicated test account. From `backend/`, run one named scenario:

```sh
uv run python -m app.agent.evaluate --case pytorch-start --output /tmp/atlas-pytorch-eval.json
```

Live checks use AI credits. Scenarios cover the first explanation, prerequisite detours,
changes of direction, returning, stopping, and small practice. Read the responses against the
saved review checklist. A successful API request is not a passing teaching-quality review.
The language instructions follow STE principles; there is no full dictionary compliance checker yet.

## Archive

`archive/` contains retired experiments and their tests, with original paths preserved.
Snapshots of changed integration files show the old wiring. Archived code is not an active
package and is excluded from lint, type checks, test discovery, and frontend Docker context.
It needs deliberate integration before reuse. Historical database migrations remain active
so existing installations can upgrade without losing their migration history.

Personal project. No open-source licence is currently applied.
