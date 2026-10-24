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
3. Open http://localhost:3000. The backend readiness endpoint is http://localhost:8000/healthz; /livez checks process liveness.

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
uv run python -m app.db.bootstrap
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
PostgreSQL is unavailable locally; CI requires PostgreSQL and fails instead of skipping. The fixture
rebuilds through Alembic and checks for model/schema drift. Never point tests at a shared server with an existing `atlas_test` database.

## Database deployment

The active backend uses SQLAlchemy ORM with psycopg 3 and Alembic. Docker Compose runs a
single `migrate` job before the backend, and waits for backend readiness before starting the web app.
On a different machine or with an external PostgreSQL server, provision a database/login,
configure `DATABASE_URL` and `JWT_SECRET`, then run from `backend/`:

```sh
uv sync --frozen
uv run python -m app.db.bootstrap
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The bootstrap recreates all 18 active schema tables from an empty database, including ADK storage.
It preserves existing data and can be repeated. Run it once per release before starting replicas;
replicas refuse startup with pending migrations or missing chat tables. PostgreSQL must provide
`vector` and `pg_trgm`; the deployment role needs permission to install them, or an administrator
must install them first. Use TLS for remote connections as required by the database provider.
Legacy Prisma tables are unused and intentionally excluded; bootstrap does not delete them.
Production needs no copied data or manual table definitions. The checked-in workflow verifies a
fresh bootstrap, a repeat bootstrap, and schema drift against PostgreSQL with pgvector.

Each process has separate application and ADK connection pools. `DB_POOL_SIZE` (5) and
`DB_MAX_OVERFLOW` (10) apply to each, so the default upper bound is 30 connections per process.
Budget this against the server limit and replica count. `DB_POOL_RECYCLE_SECONDS` defaults to 1800.
Both pools close at shutdown. `DB_SLOW_QUERY_SECONDS` (1) controls private timing logs for both
engines; application pool acquisition waits use the same threshold. Logs omit SQL and parameters.
Use realistic query plans and these timings to tune further; no production load benchmark is claimed.

Library and chat lists paginate at 100 items, managed chat history at 100 turns, legacy chat history
at 200 messages, and graph views at 200 nodes. Older items remain accessible through page controls.
The graph displays connections between nodes on the current page. Editor saves send the revision
last read; stale revisions return 409. Full-text search uses an indexed generated English vector;
changing its language requires a coordinated schema migration.

[Database audit and remediation record](docs/database-audit-2026-10-10.md).

## Agent development

### Account types and conversations

Normal accounts can start three conversations in total. Each conversation starts
when its first message is accepted, including a reply that later fails or is interrupted.
Further messages in those conversations remain available. Existing ADK conversations
count toward the same limit; accepted turns and ADK history are counted once per chat.
Accounts with more than three existing chats keep their history and can continue it.
Superusers have no conversation-count limit. Other request, spending, storage, and
active-reply limits still apply to both account types.

The account-role migration makes existing accounts normal because the former `OWNER`
role was the default for everyone. Both local signup and first Supabase sign-in create
normal accounts. Roles come from Atlas's database, never from signup fields or user metadata.
An administrator with database access can assign a role from `backend/`:

```sh
uv run python -m app.auth.roles --email you@example.com --role superuser
uv run python -m app.auth.roles --email you@example.com --role normal
```

Sign in once before assigning a role so the account exists. Changes apply to the
next submission without signing in again. Run `uv run python -m app.db.bootstrap`
before starting the updated backend to apply the role migration.

### Models and execution

Prepare the complete schema with `uv run python -m app.db.bootstrap` from `backend/` before starting the backend.
This applies Alembic migrations and creates ADK chat tables under a deployment lock.
The default is `gemini-4-argon` on Vertex AI, with high reasoning. Both the guide and
research tool use it. Override `AGENT_MODEL` and `AGENT_SEARCH_MODEL` when needed.
Project access is required. No alternative model is selected automatically.

The backend environment example lists the request, research, context-size, and time
limits. SDK retries are disabled so hidden retries do not bypass request accounting.
`GET /agent/chat/{session_id}/usage` returns owned counts, including requests with unknown usage.
It also returns `cachedInputTokens` and `cacheUnreportedRequests`. Cached tokens are part of
input tokens; missing cache metadata is unknown, not a confirmed cache miss. Static agent rules
are separate from changing conversation context. Explicit caching is not enabled.
Research-request limits count grounded model requests, not Google's internal search queries.
Actual query and token counts come from provider metadata.
`AGENT_SESSION_BUDGET_MICROUSD` defaults to 5000000 ($5); 0 explicitly disables the spending guard.
The guard stops further calls once estimated spending reaches the allowance. A pending request
holds the remaining allowance, so concurrent calls cannot both claim it. Missing usage, an
interrupted request, or missing research-query metadata blocks further spending in that session.
A confirmed HTTP 429 capacity rejection before any response is recorded separately and allows
a manual retry; it still consumes a request slot. No automatic retry is added.
Historical requests without cost records also block; start a new chat to continue.
The usage endpoint reports estimated cost, unpriced requests, and the configured allowance.

Estimates use standard Vertex model list prices, include reasoning and individual search queries,
and ignore cached-input discounts, free search allowances, and credits. Argon uses
$4 per million input tokens and $20 per million output/reasoning tokens; the
introductory discount through November 2026 is delivered as credits and is excluded. Each request's estimated
cost is persisted when usage arrives; later settings changes do not reprice past requests.
Unsupported models are
blocked while the guard is enabled. See `backend/app/agent/pricing.py` for the dated pricing source
and the retained Flash January 2027 rate change. Automatic SDK continuation is disabled
so each model call passes through the request and spending guards. This is an admission guard, not a hard billing cap:
the final in-flight request can exceed the remaining amount. No output-token ceiling is added.

## Chat transport and interruptions

Chat uses HTTP throughout. `POST /agent/chat` accepts `session_id`, `message`, and a client-generated
UUID `request_id`. It commits the turn and returns HTTP 202 immediately. Reusing the same request
ID and message returns that turn; conflicting reuse or a second active turn in the same chat
returns HTTP 409. `GET /agent/turns/{id}` reports owned status, latest tool progress, reply, and errors.
`GET /agent/chat/{session_id}` restores the conversation and latest turn, including queued messages.

The browser opens `GET /agent/turns/{id}/events` through the Next.js SSE proxy. That request
atomically claims and executes its specific owned turn. ADK streams visible response chunks,
tool starts, completions, safe failures, and terminal snapshots. Progress commits before delivery;
`Last-Event-ID` replays saved events without rerunning an interrupted turn.

There is no queue worker or background polling. A local async event wakes delivery when progress
commits; 15-second heartbeats do not query the database. No LISTEN connection is needed. The first
stream owns execution; simultaneous connections cannot execute it again.

Closing the stream or navigating away interrupts generation. Partial output and committed tool
writes remain. Graceful shutdown marks interruption; abrupt crashes expire after the turn timeout
plus 30 seconds on the next claim/submission. Unopened submissions expire after 60 seconds.
The Stop button and endpoint have been removed. No automatic model retry or continuation is added.

The hosted setup uses Supabase Auth, Postgres, and private Storage with two Cloud Run services.
Local auth and disk uploads remain available for development. See [deployment setup](docs/deployment.md)
for configuration, migrations, provider setup, credentials, and the connection-lifetime trade-off.

## Backend failures and capacity

HTTP failures return a safe `detail`, stable `code`, and `requestId`, also sent as `X-Request-ID`.
Validation reports field names and error types without echoing passwords or request bodies.
Logs keep exception types and stack locations with request/turn references; application logging
omits raw exception values, SQL parameters, prompts, and tool arguments. No automatic model
or mutation retry is introduced. A failed submission can still be checked with its original request ID.
Database commits finish before mutation success responses are sent.

Readiness checks schema setup and PostgreSQL. `/livez`
only checks the API process. Database connections wait at most 5 seconds to connect/acquire a
pool slot, statements have a 30-second server deadline, and lock waits have a 5-second deadline.
These defaults apply to both app and ADK connections and can be changed in the environment examples.
A turn may need database cleanup after disconnect; these deadlines bound server-side database waits.

At most 100 turns can be queued/running across the app, with 3 per user. Excess submissions
return `queue_full` (503) or `user_queue_full` (429). Existing request-ID retries remain readable
at capacity. There is no separate queue broker or monitoring service.

Image uploads read at most the configured limit plus one byte. Files are written through a
partial file and removed on transaction rollback; deletion removes the file after database commit.
Filesystem and database changes cannot form one atomic transaction. To inspect crash leftovers,
run `uv run python -m app.storage.assets` from `backend/`. It reports missing files and old
unreferenced files. Add `--apply` to remove only unreferenced UUID files older than 24 hours.
Recent files and referenced files are preserved; missing files require backup restoration or re-upload.
Deployments should also bound HTTP request bodies at the ingress, before multipart upload parsing.

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
The agent does not delete explanations; use the existing editor. Saving tools require an explicit-request declaration or a stored continuing agreement.
The model interprets consent; teaching style and semantic consent are not independently verified.
Concept-memory opt-out is enforced by the tools across chats. Conversation notes are bounded
and separate from saved explanations. See [the agent and tool guide](docs/agent-guide.md).

See [the live review](docs/evaluations/2026-10-10-agent.md) for observations and remaining limits.

## Archive

`archive/` contains retired experiments and their tests, with original paths preserved.
Snapshots of changed integration files show the old wiring. Archived code is not an active
package and is excluded from lint, type checks, test discovery, and frontend Docker context.
It needs deliberate integration before reuse. Historical database migrations remain active
so existing installations can upgrade without losing their migration history.

Personal project. No open-source licence is currently applied.
