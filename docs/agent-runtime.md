# Agent execution and transport

Decision: 10 October 2026; SSE transport update: 11 October 2026.
Target: a private Atlas release, not a general job platform.

## Why the previous split existed

The old endpoint ran a model turn inside a long HTTP request. A separate process-local
WebSocket hub broadcast tool events to every socket owned by the user. The UI took its reply
from HTTP and its progress from the socket. That split was wiring inherited from incremental
development, not a requirement of ADK, Gemini, or the product.

Putting chat submission on that socket would reduce the number of transports but would still
require request IDs, acknowledgements, ownership, reconnect handling, saved state, and recovery.
A socket is a connection; it is not a durable execution record.

## Current choice

Use ordinary HTTP to submit a turn, then subscribe to its server-sent events. The original
1.5-second browser polling was chosen for whole replies; streaming text is now a requirement.
`GET /agent/turns/{id}` remains available for snapshots and diagnosis, but the UI does not poll it.

`GET /agent/turns/{id}/events` checks ownership and carries visible text chunks, authoritative
message aggregates, tool starts/completions/errors, and turn status. ADK uses `StreamingMode.SSE`.
Private reasoning and the research subagent's text are excluded. Final aggregates replace the
streamed reply instead of duplicating it, including citations and notices added by callbacks.

Each event gets a per-turn sequence under the turn row lock and commits with the snapshot change.
A fresh subscription receives the current snapshot, its sequence, and up to 100 recent tool events.
Reconnection uses `Last-Event-ID` to replay only missing events from `agent_turn_events`, then
continues live. Terminal streams send the final snapshot and close. No reconnect starts model work.
SSE is a one-way server-to-browser channel, matching this use case.
See [MDN's SSE guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
Reserve WebSocket for a concrete need for continuous two-way traffic, such as realtime voice.

## Execution

1. The client creates a request UUID and retains an unconfirmed submission in session storage.
2. The authenticated submission transaction commits an owned `agent_turns` row before HTTP 202.
3. A worker claims queued rows with a short database lock, then releases the database connection.
4. Google ADK runs using its existing persisted sessions and owned tools. Progress and visible
   output are checkpointed on the turn and appended to its event log. Existing call, time,
   and spending guards still apply.
5. The final reply or failure is stored. Reads observe it independently of the submitting browser.

States: `queued → running → completed | incomplete | failed | interrupted | cancelled`.
Queued turns can also move directly to `cancelled`.

The unique request key prevents duplicate submission. A partial unique index allows only one
queued/running turn per owner and conversation. This protects ADK session history from concurrent
turns, even when two tabs submit together. Status and history endpoints always check ownership.

New ADK events are tagged with their turn ID. The UI combines untagged legacy history with
the durable turn records, so accepted messages appear immediately without duplicating ADK's
copy. ADK still sees its complete context. Queued and failed chats also appear in the session list.

## Failure behaviour and limits

| Event | Result |
| --- | --- |
| Switch tabs, navigate away, close browser | Accepted work continues; returning reads saved state. |
| Submission acknowledgement is lost | Resending the same message and request UUID returns the same turn. |
| Network loss while observing | Reads retry; reconnect never resubmits generation. |
| Restart before a queued turn is claimed | A worker can claim the persisted queue after restart. |
| Stop before execution | The owned queued turn becomes cancelled and is never claimed. |
| Stop during execution | A persisted cancellation flag signals the worker; the turn stays running until execution exits, then becomes cancelled. |
| Graceful shutdown during execution | The active turn is marked interrupted. |
| Abrupt process failure during execution | Its lease expires after the reply deadline plus 30 seconds, then a worker marks it interrupted. |
| Provider or tool failure | The error is saved; no automatic model retry. Already committed tool writes remain. |

The worker runs within the backend lifespan, one turn at a time per process. PostgreSQL claims
prevent multiple workers from claiming the same row. This keeps the private deployment small;
it is not a separately supervised worker service. Lease expiry requires a healthy worker to run.
Queued work can wait behind another conversation. Admission is limited to 100 active turns overall
and 3 per user, checked under database locks; repeated request IDs bypass new-work admission.
Tool events and text chunks persist for replay alongside the latest turn snapshot.

Live streams use a dedicated PostgreSQL session connection each, listening on a per-turn channel.
Writers issue transactional NOTIFY after appending events. A listener subscribes before reading
its snapshot/log, closing the setup race; the log remains authoritative if notifications coalesce.
Heartbeats and a durable-state recovery check run every 15 seconds. A database/network failure
closes the stream; EventSource reconnects with its last delivered cursor. Connections close when
the observer leaves. Next.js proxies the body directly and forwards the reconnect cursor using
the httpOnly session cookie. The stream stays connected while a tab is hidden.

LISTEN requires a direct/session connection. Set `DATABASE_LISTEN_URL` if the application URL
uses a transaction-mode pooler; bootstrap also needs a direct connection for its session lock.
One connection per active observer suits this private deployment; larger deployments should share
listeners. Event logs currently live as long as their turn (cascade-deleted with it); no timed
retention/compaction job is introduced. Streaming does not make the lifespan worker suitable for
Lambda or request-only CPU allocation: queue claiming and cancellation still poll independently.

Recovery means recovering state and detecting interrupted work. It does not mean resuming inside
an interrupted model request. There is deliberately no automatic replay after execution starts:
the provider may have charged or a tool may have committed before the crash. Unknown costs remain
blocked by the spending guard. There is no claim of exactly-once external tool effects.

## Explicit Stop

`POST /agent/turns/{id}/cancel` checks ownership and returns the current turn. It is idempotent:
terminal turns stay unchanged. A running turn sets `cancelRequested` and keeps the active-session
lock until cancellation completes. The worker checks this database signal every 0.5 seconds,
so the API and worker can run in different processes. No broker or process-local task registry
is required. The UI displays “Stopping…” until the terminal snapshot arrives.

Cancellation propagates through the ADK task and tool coroutines. In-flight synchronous database
tools drain before the turn is released; a committed save is not rolled back. Partial output
remains. Completion racing Stop is serialized on the turn row: whichever commits first wins;
if Stop wins, the terminal state is cancelled. A crashed worker's expired lease also honours
its saved cancellation request. Provider-side work may continue or be billed after local
cancellation; unknown usage still blocks further spending under the existing guard.

Mid-generation continuation remains outside this increment. Visible text now streams over SSE.
Checks use scripted models and local storage; no live model evaluation is required for transport work.

Verification for this increment: 136 backend tests passed with none skipped. Backend/frontend
lint, TypeScript, production build, and Alembic schema checks passed. An isolated browser run
used a fake agent and `atlas_test`: it left a running chat, returned to its progress, observed
completion without resubmitting, and restored the reply once after a full reload. No live model
evaluation ran.

Stop verification: 146 backend tests passed with none skipped, including ownership, idempotency,
queued cancellation, running-tool cancellation, partial replies, completion races, swallowed
cancellation, draining database writes, crash recovery, and worker continuation. Lint, TypeScript,
production build, migration upgrade, and schema checks passed. No browser or live model checks ran
for Stop.

## Reliability and diagnosis

HTTP errors share `detail`, `code`, and `requestId`; the ID also appears in `X-Request-ID`.
Worker errors use the persisted turn UUID as their reference. Logs record safe exception types,
stack locations, tool names, and turn execution duration; they omit exception values and input data.
Known provider access/capacity/server failures, network errors, database unavailability, and timeouts
have separate codes. API mutations commit before success is sent. There is no automatic model replay.

Limits, timeouts, and provider truncation produce `incomplete` with an `errorCode`, while retaining
the visible explanation and notice. Tool errors keep the last 10 safe name/code/message summaries
in `toolErrors`. The UI shows them independently of the model's account of what happened. A tool
may recover on a later call; these entries describe errors observed, not an assertion that every
subsequent attempt failed. Save consent remains a model instruction, not a new approval workflow.

`/healthz` is readiness: database reachable, worker task alive, and recent successful database access.
`/livez` is process liveness. Both app and ADK engines hide SQL parameters and use connection/pool,
statement, and lock deadlines. Worker retries only database access; it never replays a started turn.
Asset cleanup follows commit/rollback, with a dry-run reconciliation command for crash leftovers.
No browser checks or live model evaluations are needed for these reliability checks.

Reliability verification: 170 backend tests passed with none skipped. Checks cover sanitized
validation and exception reporting, request references, provider failures, actual PostgreSQL
statement deadlines, worker readiness, concurrent queue admission, incomplete outcomes, durable
tool errors, and file cleanup on write/commit/rollback failures. Backend/frontend lint, TypeScript,
production build, migration upgrade, and schema checks passed. Actual app and ADK connections
both reported 30-second statement and 5-second lock deadlines. The restarted local API passed
readiness, liveness, and sanitized-validation checks. Asset reconciliation ran without deletion.
No browser tests or live model evaluations ran.
