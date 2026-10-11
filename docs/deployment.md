# Cloud Run + Supabase

Atlas is prepared for two Cloud Run services (Next.js and FastAPI) and one Supabase project
(Auth, Postgres, and private Storage). The agent executes inside the SSE request, so neither
an always-on worker nor a broker is required. Local Docker Compose still uses local auth,
Postgres, and disk uploads by default.

This guide prepares a deployment; nothing is deployed just by building or testing the repository.

## 1. Configure Supabase

Create a free project in a region near your Cloud Run services. In the dashboard:

- Enable `vector` (pgvector) and `pg_trgm` under Database → Extensions.
- Use an **asymmetric JWT signing key** (ES256 or RS256). This backend deliberately does not
  accept legacy HS256 Supabase tokens. Its JWKS cache handles signing-key rotation.
- Enable Google under Authentication → Providers. Create a Google OAuth web client and use
  the callback URL shown by Supabase (`https://PROJECT.supabase.co/auth/v1/callback`) as its
  authorized redirect URI. Add your friends as Google test users if the OAuth app is in testing.
- Create a **private** Storage bucket named `atlas-assets`. Keep it private and add no public
  upload/download policies. The backend performs ownership checks before privileged Storage calls.
- Disable the Data API if you do not need it. Atlas uses SQLAlchemy directly. The migration job
  also enables RLS and revokes `anon` and `authenticated` access on all Atlas/ADK tables, including
  the migration version table. Do not add broad Data API policies to these tables.

Copy the project URL, publishable API key, and a server-only secret API key (or legacy service_role
key). The publishable key goes to Next.js; the secret key goes **only** to the backend.

For `DATABASE_URL`, copy **Session pooler, port 5432** from Connect. This supplies IPv4 and
supports the session advisory lock used by migrations and the existing psycopg/ADK clients.
Do not use the transaction pooler on port 6543 with this configuration. Percent-encode special
characters in the database password. Add `sslmode=require`; for certificate verification use
`sslmode=verify-full` and the provider's CA certificate in your container.
The application sets `search_path=public,extensions` so extensions installed by Supabase resolve.
Hosted connections apply query/lock deadlines with explicit session SET statements; they do not
rely on the pooler forwarding arbitrary libpq startup options.

Supabase Auth has its own `auth.users`; Atlas keeps an application user row linked through
`users.supabase_user_id`. First authenticated access creates that row. Passwords are not stored
for Supabase accounts. Existing local accounts are never silently linked by email.

### Email/password (optional)

Google sign-in avoids configuring email delivery. Email/password also works, but configure custom
SMTP before inviting friends: Supabase's default sender only sends to project team addresses.
Set the Supabase minimum password length to 12 to match the local policy and login form.
For server-side signup confirmation, use this confirmation-email link template:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

The callback/confirmation routes only redirect to the configured application origin. No arbitrary
`next` URL is accepted. OAuth, password login, refresh, and sign-out use server-side httpOnly cookies;
there is no browser-side Supabase client or service key.

## 2. Prepare GCP once

Use an existing billing-enabled project with your credits. Install/authenticate the `gcloud` CLI.
Replace the example project and region below before running these commands:

```bash
export PROJECT_ID=your-project-id
export REGION=asia-south1
export RUNTIME_SERVICE_ACCOUNT="atlas-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com --project "$PROJECT_ID"
gcloud artifacts repositories create atlas --repository-format=docker --location "$REGION" --project "$PROJECT_ID"
gcloud iam service-accounts create atlas-runtime --project "$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" --role=roles/aiplatform.user
```

The deployer needs permissions to build images, deploy services/jobs, configure public invocation,
and act as the runtime service account. The Cloud Build service account needs Artifact Registry
write access and logging permissions. The default build service account depends on your project's
configuration; check it rather than assuming a particular account.

Create two Secret Manager secrets using the console (do not commit their values):

| Secret name | Value |
| --- | --- |
| `atlas-database-url` | Supabase session-pooler connection string with TLS |
| `atlas-supabase-service-key` | Supabase secret/service_role API key |

Grant `roles/secretmanager.secretAccessor` to the runtime service account on each of these two
secrets. Cloud Run uses its service account for Vertex through Application Default Credentials;
no downloaded service-account JSON is needed. The web service receives neither database nor
Storage credentials (although this simple setup shares the runtime service account).

## 3. Configure and deploy

Copy `deploy/backend.env.example.yaml` and `deploy/web.env.example.yaml` **outside the repository**,
then fill in your project details. These YAML files are runtime configuration, not build arguments.
Use the same Supabase project URL and `AUTH_PROVIDER=supabase` in both files.

```bash
export BACKEND_ENV_FILE=/absolute/path/outside/repo/backend.yaml
export WEB_ENV_FILE=/absolute/path/outside/repo/web.yaml
# PROJECT_ID, REGION, and RUNTIME_SERVICE_ACCOUNT are still set from above.
bash deploy/cloud-run.sh
```

The script builds both images, executes a single migration job with retries disabled, then deploys
the API and web services. A failed migration stops the rollout. API replicas validate the schema;
they do not run Alembic migrations. The script discovers both service URLs and sets `ATLAS_API_URL`
and `APP_URL` on the web service. For an existing custom domain, set `PUBLIC_APP_URL` before running it.
During the initial deployment, the first web revision may be briefly unconfigured until this update.

Both containers honor Cloud Run's `PORT` and listen on `0.0.0.0`. API readiness checks migrations
and Postgres; `/livez` only checks the process. The API is publicly reachable but every data route
requires a valid user token; health endpoints are public. Next.js forwards the bearer token and
SSE body server-side, without buffering.

After deployment, set Supabase's Site URL to `APP_URL` and allow the exact
`APP_URL/auth/callback` redirect URL. For local Supabase testing, also allow
`http://localhost:3000/auth/callback` and set local `APP_URL=http://localhost:3000`.

## Defaults and trade-offs

- Both services: request-based CPU, zero minimum instances, maximum two instances. Cold starts
  are expected. Request timeout is 600 seconds on both sides of the SSE proxy.
- Agent: 480-second turn timeout, leaving time for database cleanup before Cloud Run's deadline.
- API: concurrency 4, one CPU, 1 GiB RAM. Web: concurrency 20, one CPU, 512 MiB RAM.
- Application and ADK each get their own pool of two connections per API instance, no overflow:
  at most eight pooled connections across two API instances, plus migration/administrative access.
- Per-user storage allowance: 50 MiB. Image maximum: 10 MiB. Agent session estimated-spending
  guard: $1. These application guards do not impose a hard provider billing cap.

The free Supabase plan currently has a 500 MB database and 1 GB file storage; embeddings and
chat event history count toward database size. Free projects can pause after a week of inactivity.
Check the dashboard before a demo. Cloud Run, builds, registry storage, network traffic, Secret
Manager, and model calls have separate quotas/pricing; these settings do not guarantee a $0 bill.
Use GCP budget alerts and your credits. No heartbeat traffic is used to keep either provider awake.

## Stream lifetime and recovery

Submitting a turn persists it and returns HTTP 202. Opening its SSE URL atomically claims and
executes **that exact owned turn**. Tool activity and text are persisted before delivery. A local
async event wakes delivery; idle heartbeats do not query Postgres. There is no queue scanner,
LISTEN connection, cancellation flag polling, or Stop endpoint/button.

Closing the connection, navigating away, or shutting down the service interrupts the request.
Partial replies and committed tool writes remain. Reconnect replays saved events; it never reruns
an interrupted turn. Only one connection owns execution. A second simultaneous connection gets
`stream.conflict`; reload after the owning connection finishes to read the saved result.

An unopened submission expires after 60 seconds; a crashed running turn expires after its turn
lease (timeout + 30 seconds). Stale records are marked interrupted on the next claim/submission,
not by periodic background work. They are never automatically executed again. An in-flight
provider request may still be billed and a database tool is drained before interruption completes.

## Existing local data

Changing a connection URL does not copy your local database or uploads. For a fresh demo, leave
local data untouched and create new hosted accounts. If you want existing content in Supabase,
back up the local database and upload directory first, then copy the Atlas and ADK tables using
Postgres tooling; do not replace Supabase's managed schemas. Run the migration job against the
hosted copy before serving it. Local UUID ownership stays intact.

For each account you intentionally migrate, obtain its verified Supabase user UUID from the
Authentication dashboard and explicitly map it to the existing application user, for example:

```sql
BEGIN;
UPDATE public.users
SET supabase_user_id = 'VERIFIED_SUPABASE_USER_UUID'
WHERE id = 'EXISTING_ATLAS_USER_UUID' AND supabase_user_id IS NULL;
-- Verify exactly one intended row was updated before committing.
COMMIT;
```

Upload existing image files into the private `atlas-assets` bucket with their existing UUID
filenames and MIME types from `assets`. Do not rename them to the original user-supplied filename.
Cloud Run disk is ephemeral; keep hosted `STORAGE_BACKEND=supabase` on all API revisions.

Remote object storage and Postgres are not one atomic transaction. Upload failures/rollbacks
attempt compensating deletion; normal deletion runs after the database commit. A crash or Storage
outage can leave an orphan object. Compare old bucket UUIDs against `public.assets` before removing
orphans manually, preserving recent uploads. The local filesystem cleanup CLI refuses to run
against remote storage, so it cannot silently report a misleading remote cleanup result.

## Smoke checks after supplying real credentials

1. Confirm `atlas-migrate` succeeds and API `/healthz` returns 200.
2. Sign in with Google; reload the page and verify the session remains available.
3. Send a chat; verify text and tool events arrive incrementally through the web service.
4. Upload, read, and delete an image. A second account must receive 404 for its URL.
5. Close a chat stream during generation; reopen and verify interruption with saved partial output.
6. Revisit after a cold start. No local files or process memory should be required to restore data.

Local automated checks cover the migrations, signed Supabase tokens (including wrong issuer,
audience, expiry, and signatures), ownership, Storage REST behavior with a fake service, real
ASGI disconnect cleanup, and Postgres-backed streaming. Actual Google OAuth, Supabase's hosted
pooler, and a deployed Cloud Run stream require your project credentials and a live smoke check.

Sources: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[JWT keys](https://supabase.com/docs/guides/auth/signing-keys),
[database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Storage API](https://supabase.com/docs/reference/self-hosting-storage),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[pricing](https://supabase.com/pricing),
[Cloud Run timeouts](https://cloud.google.com/run/docs/configuring/request-timeout).
