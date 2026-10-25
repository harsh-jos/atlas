# Agent experience implementation

Implemented on `codex/agent-experience`, based on freshly fetched `origin/main` at `84c86c5`.
The research proposal is [here](agent-experience-research-2026-10-25.md).

## Delivered

1. Task-sensitive explanation guidance; repaired SSE evaluation transport; prompt/build fingerprints.
2. A native, versioned response renderer interleaving Markdown with diagrams, steppers, comparisons,
   polynomial plots, worked examples, owned image figures and optional detail. The implementation
   uses a small application-owned schema rather than introducing OpenUI or replacing the chat stack.
3. Canonical response persistence, text fallbacks, private asset checks, reloadable visual state,
   passage/step follow-up drafts, and readable copy/export.
4. Post-answer concept extraction with schema validation, exact supporting excerpts for nodes/edges,
   aliases, developed overviews, revision history, human-edit protection and richer relation kinds.
5. Private conversation links from graph inspectors and concept pages, including loading targets
   outside paginated history. Older explanations can explicitly request concept extraction.
6. Configurable Nano Banana generation and visual review, private quota-aware storage, atomic
   per-turn limits, and image-modality usage estimates. Added bounded public-source reading and
   AST-only arithmetic. Routine graph-bookkeeping tools are removed from the guide.
7. Reusable Markdown/component artifacts and isolated HTML simulation playback, optimistic revision
   checks, quota-accounted immutable snapshots, download, source links and print/save-PDF.
8. Durable Cloud Tasks execution for hosting and a database worker for development; independent SSE
   observers, leased/fenced execution, reconnect, cancellation, separate enrichment jobs and retry UI.
9. Deployment/runtime documentation and examples updated for the changed contracts.

## Verification

Frontend production build, TypeScript and ESLint passed. Backend Ruff passed. Focused backend
checks cover turn/accounting behavior, stream replay/disconnect, scripted ADK integration,
enrichment evidence/idempotency, component fallback and image pricing. Existing frontend checks
and deployment-script checks passed. All ten guide tool declarations compile through ADK.
The five new migration revisions generate valid PostgreSQL migration SQL in sequence.

No hosted data was migrated or rewritten, no Cloud Run service was deployed, and no paid model
calls were made. The Docker daemon was unavailable, so a fresh real-PostgreSQL migration/drift
round trip was not performed locally. The existing database CI job remains responsible for that
check before merge. Scripted/model-schema checks do not establish live teaching quality.

## Rollout

- Follow the Cloud Tasks API/IAM setup in [deployment.md](deployment.md): queue-admin access for
  deployment, enqueuer plus actAs for runtime, and the normal Cloud Tasks service-agent role.
- Apply the five new revisions with the normal bootstrap before serving the updated application.
  RLS protection includes the new metadata tables. No automatic account-wide backfill occurs.
- Use the deployment script to configure queue URL, audience and identity. Hosted execution must
  select `cloud_tasks`; local database polling is for a running development backend.
- Confirm the chosen image, review and extraction models are available in the actual Vertex project.
  Run one dedicated-account live interaction with a native diagram, one image and one artifact.
- Review the explanation and extracted graph for semantic quality, then confirm reload, Stop and
  links back to an older conversation. Artifact HTML has a browser sandbox and playback timer;
  it is not arbitrary server-side code execution or a process-level CPU sandbox.

The code does not automatically recover unknown provider charges or resume a crashed model
mid-generation. Such turns remain interrupted with saved partial work; live background metering
is awaited so it does not prematurely fail an immediate follow-up.
