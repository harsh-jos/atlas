# Agent execution and transport

Updated 11 October 2026 for Cloud Run scale-to-zero deployment.

Atlas submits over ordinary HTTP, then executes the owned turn inside its SSE request.
`POST /agent/chat` durably records the message and request UUID before returning HTTP 202.
`GET /agent/turns/{id}/events` checks ownership, atomically claims exactly that turn, and runs ADK.
No lifespan worker, broker, queue polling, cancellation polling, or LISTEN connection is required.

Text deltas, final aggregates, tool starts/completions/errors, and terminal states are persisted
in sequence before being streamed. Private reasoning and internal researcher prose are excluded.
A local async event wakes delivery after progress commits. Idle SSE heartbeats do not query the
database. The final aggregate replaces streamed text to avoid duplication.

The partial unique index permits one active turn per owner/conversation; request UUIDs prevent
duplicate submission. Only one connection owns execution. Concurrent connections receive
`stream.conflict`, and the user can reload after the owning request finishes to read saved data.

Closing the connection or navigating away interrupts generation. Partial replies and committed
tool writes remain; no automatic model retry occurs. A reconnect replays missing events using
`Last-Event-ID`, then returns the authoritative terminal snapshot. It does not resume generation.
Unopened submissions expire after 60 seconds. Crashed running turns expire after timeout + 30
seconds. Recovery occurs on the next claim/submission, without a periodic maintenance worker.
The Stop UI and endpoint are retired; cancellation columns/statuses remain for historical rows.

This trades execution independent of the browser for simple request-based hosting. Cloud Run
keeps CPU available for the open request and can scale to zero afterwards. Both API and web proxy
must support unbuffered streams and have a timeout longer than the agent deadline.

For setup, provider configuration, limitations, and smoke checks, see [deployment.md](deployment.md).
