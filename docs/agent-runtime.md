# Agent execution and transport

Decision: 10 October 2026. Target: a private Atlas release, not a general job platform.

## Why the previous split existed

The old endpoint ran a model turn inside a long HTTP request. A separate process-local
WebSocket hub broadcast tool events to every socket owned by the user. The UI took its reply
from HTTP and its progress from the socket. That split was wiring inherited from incremental
development, not a requirement of ADK, Gemini, or the product.

Putting chat submission on that socket would reduce the number of transports but would still
require request IDs, acknowledgements, ownership, reconnect handling, saved state, and recovery.
A socket is a connection; it is not a durable execution record.

## Current choice

Use ordinary HTTP to submit a turn and read its status. The same turn record contains both
tool progress and the reply. Poll only an active turn; idle chats create no polling traffic.
The client pauses polling while hidden and refreshes on visibility and network recovery.

Atlas currently delivers whole replies, and tool progress is infrequent. Polling at 1.5 seconds
is sufficient for this release and requires no streaming proxy, heartbeat, socket registry,
message broker, or event replay log. It is not intended for high-frequency token updates.

If token streaming becomes a product requirement, keep HTTP submission and replace polling
with one SSE subscription carrying progress and reply events. Persist event IDs before sending
them and support replay after reconnect. SSE is a one-way server-to-browser channel, matching
that use case. See [MDN's SSE guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
Reserve WebSocket for a concrete need for continuous two-way traffic, such as realtime voice.

## Execution

1. The client creates a request UUID and retains an unconfirmed submission in session storage.
2. The authenticated submission transaction commits an owned `agent_turns` row before HTTP 202.
3. A worker claims queued rows with a short database lock, then releases the database connection.
4. Google ADK runs using its existing persisted sessions and owned tools. Progress and visible
   output are checkpointed on the turn. Existing call, time, and spending guards still apply.
5. The final reply or failure is stored. Reads observe it independently of the submitting browser.

States: `queued → running → completed | failed | interrupted`.

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
| Graceful shutdown during execution | The active turn is marked interrupted. |
| Abrupt process failure during execution | Its lease expires after the reply deadline plus 30 seconds, then a worker marks it interrupted. |
| Provider or tool failure | The error is saved; no automatic model retry. Already committed tool writes remain. |

The worker runs within the backend lifespan, one turn at a time per process. PostgreSQL claims
prevent multiple workers from claiming the same row. This keeps the private deployment small;
it is not a separately supervised worker service. Lease expiry requires a healthy worker to run.
Queued work can wait behind another conversation. Latest tool status is saved, not a full event log.

Recovery means recovering state and detecting interrupted work. It does not mean resuming inside
an interrupted model request. There is deliberately no automatic replay after execution starts:
the provider may have charged or a tool may have committed before the crash. Unknown costs remain
blocked by the spending guard. There is no claim of exactly-once external tool effects.

User cancellation, mid-generation continuation, and token streaming remain outside this increment.
Checks use scripted models and local storage; no live model evaluation is required for transport work.

Verification for this increment: 136 backend tests passed with none skipped. Backend/frontend
lint, TypeScript, production build, and Alembic schema checks passed. An isolated browser run
used a fake agent and `atlas_test`: it left a running chat, returned to its progress, observed
completion without resubmitting, and restored the reply once after a full reload. No live model
evaluation ran.
