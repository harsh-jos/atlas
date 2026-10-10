# Atlas

Explore a subject with expert guidance. Keep useful explanations, see connections,
and return when curiosity brings you back.

[Purpose and v0.1 feature list](docs/product.md) is the only product plan.
The local agent supports exploration, saved explanations, and a small concept graph.
The v0.1 release checklist is not complete.

## Local development

The stack is Next.js, a Python FastAPI backend with Google ADK, and PostgreSQL with pgvector.

1. Copy `.env.example` to `.env` and set a random `JWT_SECRET`.
2. Start Docker, then run `docker compose up --build`.
3. Open http://localhost:3000. The backend health endpoint is http://localhost:8000/healthz.

The agent needs `VERTEX_PROJECT` and Google Application Default Credentials available to the
backend process. For a local service-account file, set `GOOGLE_APPLICATION_CREDENTIALS`
to its absolute path in `backend/.env`. Use `.secrets/vertex.json` in the project root (gitignored, directory mode 700, file mode 600).
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
The default is `gemini-3.8-flash` on Vertex AI, with high reasoning. Both the guide and
research tool use it. Override `AGENT_MODEL` and `AGENT_SEARCH_MODEL` when needed.
Project access is required. No alternative model is selected automatically.

The backend environment example lists the request, research, context-size, and time
limits. SDK retries are disabled so hidden retries do not bypass request accounting.
`GET /agent/chat/{session_id}/usage` returns owned counts, including requests with unknown usage.
Research-request limits count grounded model requests, not Google's internal search queries.
Actual query and token counts come from provider metadata.
`AGENT_SESSION_BUDGET_MICROUSD` defaults to 5000000 ($5); 0 explicitly disables the spending guard.
The guard stops further calls once estimated spending reaches the allowance. A pending request
holds the remaining allowance, so concurrent calls cannot both claim it. Missing usage, an
interrupted request, or missing research-query metadata blocks further spending in that session.
Historical requests without cost records also block; start a new chat to continue.
The usage endpoint reports estimated cost, unpriced requests, and the configured allowance.

Estimates use standard Vertex Flash list prices, include reasoning and individual search queries,
and ignore cached-input discounts, free search allowances, and credits. Each request's estimated
cost is persisted when usage arrives; later settings changes do not reprice past requests.
Unsupported models are
blocked while the guard is enabled. See `backend/app/agent/pricing.py` for the dated pricing source
and the published January 2027 rate change. This is an admission guard, not a hard billing cap:
the final in-flight request can exceed the remaining amount. No output-token ceiling is added.

## Chat transport and interruptions

Chat uses HTTP throughout. `POST /agent/chat` accepts `session_id`, `message`, and a client-generated
UUID `request_id`. It commits the turn and returns HTTP 202 immediately. Reusing the same request
ID and message returns that turn; conflicting reuse or a second active turn in the same chat
returns HTTP 409. `GET /agent/turns/{id}` reports owned status, latest tool progress, reply, and errors.
`GET /agent/chat/{session_id}` restores the conversation and latest turn, including queued messages.

A backend lifespan worker claims queued turns from PostgreSQL. The browser polls active status
every 1.5 seconds while visible, and refreshes the saved conversation on completion, foreground
return, or restored network access. Next.js proxies reads using the httpOnly session cookie;
no browser-facing backend token or socket ticket is needed. There is no WebSocket, SSE, or token
streaming. The old WebSocket hub and tests are archived.

Navigating away or closing the browser does not cancel accepted work. Queued work survives a
backend restart. Graceful shutdown marks active work interrupted. After an abrupt crash, a running
turn becomes interrupted when its lease expires (reply timeout plus 30 seconds), rather than
remaining stuck forever. Persisted partial output and saved explanations remain. Running work is
never automatically replayed: tool writes or provider charges may already have happened.
Use the chat Stop button or `POST /agent/turns/{id}/cancel` to stop an owned turn.
Queued turns cancel immediately. Running turns stay active with `cancelRequested: true` until
the worker cancels execution and stores `cancelled`; partial replies and saved work remain.
Repeated Stop requests are safe, and completed turns are unchanged. An in-flight provider
request may still be billed. An in-flight database tool is allowed to finish before the chat
accepts another turn. No mid-generation continuation is implemented.

See [the runtime and transport decision](docs/agent-runtime.md) for scope and tradeoffs.

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

## Agent memory and graph

The agent can inspect nearby concepts, search/read saved explanations, and remember concepts
actually explored. It adds `requires` and `related_to` connections with short reasons.
`requires` points from an idea to its prerequisite; `related_to` is symmetric.
Ask “keep this” to save an explanation, or ask for a revision after returning.
Saved explanations appear in the existing library, reader, editor, and graph.
The graph's `explains` edges come from each explanation's concept membership.

Writes are scoped to the authenticated owner, enforce text-storage quota, reuse duplicate
saves/connections, and reject stale revisions. Concept pages let you remove a connection.
The agent does not delete explanations; use the existing editor. Saving consent and teaching
style are model instructions, not a separate deterministic policy checker.

See [the live review](docs/evaluations/2026-10-10-agent.md) for observations and remaining limits.

## Archive

`archive/` contains retired experiments and their tests, with original paths preserved.
Snapshots of changed integration files show the old wiring. Archived code is not an active
package and is excluded from lint, type checks, test discovery, and frontend Docker context.
It needs deliberate integration before reuse. Historical database migrations remain active
so existing installations can upgrade without losing their migration history.

Personal project. No open-source licence is currently applied.
