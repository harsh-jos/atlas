# Durable agent execution

Updated 25 October 2026.

`POST /agent/chat` commits an owned turn and its request UUID before scheduling work.
Hosted deployments enqueue an authenticated Cloud Tasks HTTP job. Development uses a
lifespan worker that consumes the same committed database queue. The browser is an observer:
`GET /agent/turns/{id}/events` replays durable events, then follows new events. Closing a tab
or opening a second observer neither cancels nor restarts generation.

Cloud Tasks uses a deterministic task name, a 30-minute dispatch deadline, and OIDC from the
configured runtime service account. Internal worker endpoints validate the token's audience,
verified email and issuer. A user session token cannot call them. Dispatch failures return
503 with the accepted message retained; retrying its request UUID safely schedules the same turn.

A worker atomically claims one turn with a bounded lease and random fencing token. Progress
and terminal writes require that token. Duplicate deliveries do not run a second provider
request. An expired/crashed execution becomes interrupted, preserving partial text and saved
work. It is not automatically replayed: provider charges and partially completed tools may be
uncertain. This is durable job ownership, not mid-token checkpoint/resume.

Text deltas, final aggregates, tools, failures and terminal states commit in sequence before
streaming. Aggregates replace chunks. Completed responses also store a versioned document
containing ordered Markdown/native-component blocks and accessible text. Invalid and unfinished
visual syntax gets a readable fallback. Private reasoning and internal research prose stay private.

`POST /agent/turns/{id}/cancel` stops a queued turn or signals its worker. Workers poll this
small cancellation record; database tools drain in-flight transactions before returning.
Cancellation retains already committed assets/artifacts and partial explanations.

After the answer completes, a separately scheduled enrichment job extracts grounded concepts,
revisions, relationships and exact conversation evidence. It has its own lease and bounded
attempt counter. Its failure does not invalidate the answer. A person can retry a failed update
(up to three attempts) or request extraction for an older completed explanation. Existing data
is not mass-rewritten during migration. Memory-off is checked again before committing enrichment.

The spending ledger covers guide, researcher, image generation, image review and enrichment.
When a live background request is awaiting usage metadata, a follow-up waits for settlement.
A failed/unknown charge still blocks further spending. Images have an atomic per-turn allowance
and distinct image-output pricing. Estimates and admission guards are not hard billing caps.

Defaults: 20 model calls, three research calls, two image-generation attempts and 900 seconds
for the teaching turn. Enrichment is bounded to 180 seconds. The hosted API timeout is 1800
seconds; the SSE proxy can reconnect independently. Local workers require a running backend;
queued rows survive its restart. Cloud Run uses request-based CPU while Cloud Tasks owns the
worker request and can scale to zero between jobs.

Apply migrations through `python -m app.db.bootstrap` before serving the new backend.
See [deployment.md](deployment.md) for queue/IAM setup and [agent-guide.md](agent-guide.md)
for components and tools. No hosted migration or rollout was performed by the implementation chat.
