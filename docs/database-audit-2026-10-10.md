# Database audit — 10 October 2026

Audited on `codex/learning-agent`. This audit changes documentation only. The existing application database was inspected in a read-only transaction. Rebuild, query-count, and concurrency checks used uniquely named temporary databases on the local Docker PostgreSQL server; both temporary databases were removed. No model/provider calls were made.

## Remediation on the same branch

The findings below record the original audit baseline. Follow-up fixes were committed separately
on `codex/learning-agent`:

| Commit | Fix |
| --- | --- |
| `515b36f` | Owner-first locking for editor and quota-affecting deletes, stale editor revision checks |
| `6558797` | Batched concept/neighbour reads, narrow projections, aggregate deletion costs and DB cascades |
| `004bddd` | Generated English search vector, GIN full-text/trigram/tag indexes, ordered-read indexes; test schema built through Alembic |
| `3a52261` | Projected chat summaries, persisted first-message state for new chats, SQL filtering of managed duplicate events |
| `5edc669` | Configurable pool budgets/recycling, slow-query and acquisition-wait logs |
| `af80c74` | Single locked schema bootstrap, startup schema validation/readiness, ADK pool shutdown |
| `9cc7137` | Bounded library/graph/history reads with controls to access older results |
| `394dd80` | Aggregate usage admission checks in SQL |

The final follow-up also adds CI schema reconstruction and focused regressions with PostgreSQL
required, including a real two-session editor-write check. No browser tests or live model calls
were used. The complete bootstrap was run twice on an empty temporary database, both succeeding,
with 17 active tables and no application schema drift. Final measurements: six concepts now
use one SQL query (previously eight); five neighbours use four queries (previously eight).
TypeScript and touched frontend lint passed.

The current migration head is `2a6f8090a007`. Production setup now uses
`uv run python -m app.db.bootstrap`, not Alembic alone; see the README for the maintained setup
instructions. The original commands below describe the audited baseline. Legacy Prisma tables
remain untouched. Indexes are matched to current query shapes; production-scale plan/throughput
tuning remains an operational exercise, not a claim made by these focused checks.

## Architecture and existing safeguards

The active Python backend uses SQLAlchemy 2 ORM, with psycopg 3 as the PostgreSQL driver and Alembic for application migrations. ORM models live in `backend/app/db/models.py`; repositories, library queries, agent stores, and agent knowledge tools build SQLAlchemy expressions. Raw SQL is limited to infrastructure operations such as health checks and migration DDL. The frontend has no active Prisma dependency. Archived demo scripts still reference Prisma.

`backend/app/db/base.py` caches one synchronous SQLAlchemy engine per process. Google ADK's `DatabaseSessionService` uses a separate asynchronous engine for conversations in the same PostgreSQL database. Both engines use pooling. Runtime inspection confirmed:

| Setting | Application engine | ADK engine |
| --- | --- | --- |
| Pool implementation | QueuePool | AsyncAdaptedQueuePool |
| Pool size | 5 | 5 |
| Maximum overflow | 10 | 10 |
| Connection/acquisition timeout | 5 seconds | Shared configuration: 5 seconds |
| Statement timeout | 30 seconds | Shared configuration: 30 seconds |
| Lock timeout | 5 seconds | Shared configuration: 5 seconds |
| Stale connection checks | Enabled | Enabled |
| SQL parameter hiding | Enabled | Enabled |

The two pools can together use up to 30 connections per backend process once both are active, excluding deployment/migration/admin connections. Connections are created as needed. Pool size and overflow currently use library defaults and have no environment settings. Size the combined pools against PostgreSQL's connection limit before increasing process/replica counts. PgBouncer is an optional deployment choice, not a missing prerequisite for the current single-instance app. See [SQLAlchemy pooling documentation](https://docs.sqlalchemy.org/en/20/core/pooling.html).

Sessions use transaction context managers: commit on success, rollback on failure, return the connection when closed. HTTP write dependencies finish before success responses. Agent tools and queue operations use short transactions in worker threads; model/network calls do not deliberately retain application transactions. ADK performs asynchronous database operations. The queue uses `FOR UPDATE SKIP LOCKED`, a partial unique index for one active turn per conversation, and advisory locks for admission. Quota reservations use guarded atomic updates. These are good foundations.

## Findings, in recommended order

1. **High: concurrent editor writes corrupt quota accounting and overwrite edits.** `backend/app/api/writes.py:136` reads the artifact and calculates its byte delta before obtaining the lock caused by updating the user quota. Two requests can calculate deltas from the same old body. Reproduced with the actual PATCH handler in two independent sessions, synchronized immediately before `_charge`: a 10-byte body was concurrently replaced with 20 and 30 bytes. Both requests committed, `storage_bytes` became 40, and the final stored body was 20 bytes. The guarded user update prevents simultaneous quota reservations exceeding the ceiling, but does not make the artifact read/delta/write atomic. Use a consistent owner-first locking protocol across editor and agent writes, then read/lock the target row and calculate the delta; add an expected-version check to reject stale editor changes. Review artifact/concept deletion under the same protocol: those paths also calculate released bytes from unlocked state. The agent revision path already locks the owner and artifact and checks `updated_at`.

2. **Medium: chat listing fetches complete histories once per session.** `backend/app/agent/session.py:113` lists sessions, then sequentially calls ADK `get_session` for every result to extract the first user message. Each call also loads events and state. `backend/app/agent/service.py:96` additionally calls `TurnStore.summaries`, which reads every managed turn message and reduces them in Python. Persist a conversation title/first-message summary and activity timestamp, query summaries in a batch, and paginate. Current history loading also fetches ADK events before discarding managed events, then reads the managed turns again; consider a legacy-history path and paginated current history.

3. **Medium: concept listing has N+1 queries.** `backend/app/library.py:40` executes one count query, one concept query, then one recent-artifact query per concept. Measured six concepts producing eight SQL queries, excluding authentication. Replace the per-concept calls with a batched latest-artifact query, for example PostgreSQL `DISTINCT ON` or a window function, and combine with counts as appropriate.

4. **Medium: search rebuilds text vectors without an index.** `backend/app/search.py:40` computes `to_tsvector` from title, summary, and body for candidate artifacts on every search. No full-text GIN index exists in the models or migrations, or on the rebuilt schema. Add a stored/generated search vector and GIN index with an explicit text-search configuration, then query that vector. Alternatively, use an immutable matching expression suitable for an expression index; do not blindly index the current `concat_ws` expression. Search language is currently configurable, so coordinate the indexed configuration and query settings. The `%query%` relation picker also lacks a trigram index, but that is lower priority at small scale. See [PostgreSQL text-search indexes](https://www.postgresql.org/docs/16/textsearch-tables.html).

5. **Medium: neighbourhood loading has N+1 queries.** `backend/app/agent/knowledge.py:96` retrieves each neighbouring concept separately. Measured five neighbours producing eight SQL queries. This is bounded to 20 neighbours, but still adds avoidable latency to repeated agent tool calls. Fetch all neighbour IDs in one owned query or join the concepts into the edge query.

6. **Medium: unnecessary large-column and relationship loading.** Concept pages select whole `Artifact` objects, including bodies, HTML, metadata, and embeddings, then fetch complete source rows just to count them. Neighbourhood summaries likewise select whole artifacts. Relation queries select full artifacts and concepts but return only a few fields. Use explicit projections or deferred columns and aggregate source counts. Concept deletion materializes every artifact to total text bytes and uses ORM delete cascades, which can load/delete child sources individually. Consider SQL aggregation and database cascades with carefully configured `passive_deletes`.

7. **Medium: deployment does not provision the entire active schema eagerly.** Docker runs Alembic before Uvicorn, but ADK tables are created lazily on the first ADK operation. `/healthz` checks the queue worker and `SELECT 1`; it does not prove ADK schema preparation works. Bootstrap ADK tables as a deployment step, or prepare them explicitly at startup and include that result in readiness. ADK's preparation lock is process-local, so multiple fresh replicas can race on initial DDL. Alembic startup migrations can also race between replicas. Use a single migration/bootstrap job before application replicas start.

8. **Low: ADK pool shutdown is missing.** `backend/app/main.py:35` disposes the application engine but does not close the cached ADK session service. Await the ADK service's `close()` during shutdown if it was initialized, without creating it solely for cleanup.

9. **Low: migration reproducibility is not protected by the normal test fixture.** `backend/tests/conftest.py` creates schema using `Base.metadata.create_all`, not Alembic. Tests can therefore pass while a migration is missing or broken; database tests also skip if PostgreSQL is unavailable. Add a CI job with PostgreSQL/pgvector that upgrades an empty database, upgrades again, and runs `alembic check`, with no database-unavailable skips. Pin application dependency versions via the existing lockfile; validate ADK schema changes when upgrading ADK.

10. **Scale-dependent: indexes, pagination, and observability need workload evidence.** Evaluate composite indexes matching artifact `(user_id, concept_id, updated_at, id)` and queue claim `(status, created_at, id)` ordering, and expired lease lookup, using realistic `EXPLAIN (ANALYZE, BUFFERS)` results. Existing ownership, foreign-key, uniqueness, and session indexes are present. Add a unique tie-breaker to concept-page ordering; offset pagination without one can repeat or skip equal-sort rows. Concepts, chat summaries/history, and the graph are unbounded. Usage reservation reads all requests in a session, but the default 256-call limit bounds that cost, so it is lower priority. Add slow-query/pool-wait metrics or `pg_stat_statements` before speculative indexing. An embedding index is not currently needed by an active vector-search query: the current search implementation is full-text.

## Schema reconstruction: verified result

**The schema required by the active backend can be rebuilt without copying existing data or asking the original developer to describe tables.** Its definitions are in the repository and pinned ADK dependency. A blank rebuild passed on PostgreSQL 16 with pgvector:

1. `alembic upgrade head` applied the complete migration chain through `195e6f70a006`.
2. Application schema contained 11 model tables plus `alembic_version`.
3. A second upgrade succeeded without changes.
4. `alembic check` found no model/schema drift.
5. ADK `prepare_tables()` created `adk_internal_metadata`, `app_states`, `events`, `sessions`, and `user_states`.
6. The application schema check still passed after ADK initialization; Alembic intentionally excludes foreign tables.

A read-only inspection of the current local application database found the same migration head and no application metadata drift. It also found six historical objects outside the current migration system: `Asset`, `Collection`, `Entry`, `Relation`, `Source`, and `_prisma_migrations`. Archived scripts reference Prisma; the active application does not. **An empty rebuild will not recreate those legacy tables.** That is a distinction between reconstructing the active application's schema and making an exact structural clone of everything currently in the old database. If preserving those legacy objects becomes a requirement, capture their DDL in a separate schema-only export or explicit migration. This audit leaves them intact.

## Setting up another machine or production

For local Docker setup, copy `.env.example` to `.env`, supply a random `JWT_SECRET`, then run `docker compose up --build`. PostgreSQL creates the configured database/user in a fresh volume; the backend image applies application migrations automatically. ADK creates its tables on first use. Vertex credentials are required for model execution, not for reconstructing tables.

For an external/production database, provision PostgreSQL with the pgvector extension available, a database, and database credentials; configure `DATABASE_URL` and `JWT_SECRET`; install locked dependencies (`uv sync --frozen`); then run this from `backend/`:

```sh
uv run alembic upgrade head
uv run alembic check
```

The initial migration executes `CREATE EXTENSION IF NOT EXISTS vector`, so its role must be allowed to create that extension, or an administrator must install it first. Alembic creates tables inside an existing database; it does not provision the PostgreSQL server, database, or login role. Configure TLS according to the production database service.

To create ADK's tables before traffic arrives, an explicit bootstrap step using the currently pinned SDK can run:

```sh
uv run python - <<'PY'
import asyncio
from app.agent.session import get_session_service

async def bootstrap():
    service = get_session_service()
    try:
        await service.prepare_tables()
    finally:
        await service.close()

asyncio.run(bootstrap())
PY
```

Run migration and bootstrap once before starting replicas, with a deployment role that owns the necessary schema objects. Grant runtime access to the prepared tables and validate ADK startup under that role. A fresh database needs no historical users, artifacts, or conversation data to have a complete active schema. Docker is a packaging choice; it is not the source of schema definitions.

The rebuild and tiny fixture checks establish structural correctness and query counts. They do not establish production latency, throughput, or optimal indexes; no production-scale benchmark was performed.
