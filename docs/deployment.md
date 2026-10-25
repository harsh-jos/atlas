# Cloud Run + Supabase

Atlas is prepared for two Cloud Run services (Next.js and FastAPI) and one Supabase project
(Auth, Postgres, and private Storage). Cloud Tasks owns agent execution while SSE observes persisted progress; no always-on worker is required. Local Docker Compose still uses local auth,
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
- Disable the Data API if you do not need it. Atlas uses SQLAlchemy directly. Database setup
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

CI builds Docker images on GitHub runners, publishes them to Artifact Registry, then deploys
Cloud Run. This path uses neither Cloud Build nor Secret Manager. Use a billing-enabled GCP
project with Vertex model access. Tokyo is `asia-northeast1` and is appropriate for Supabase's
Northeast Asia (Tokyo) region. Use your actual Supabase region when choosing a deployment region.

Enable Cloud Run, Artifact Registry, Vertex AI, IAM, IAM Credentials, and Security Token Service:

```bash
export PROJECT_ID=polar-ensign-512612-b4
export REGION=asia-northeast1
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudtasks.googleapis.com
```

Create the image repository and service accounts once:

```bash
gcloud artifacts repositories create atlas --repository-format=docker --location "$REGION"
gcloud iam service-accounts create atlas-deploy --display-name="Atlas GitHub deployer"
gcloud iam service-accounts create atlas-runtime --display-name="Atlas Cloud Run runtime"
```

Use separate identities for deployment and application runtime. Give `atlas-deploy`:

- `roles/run.admin` on the project (creating public services needs IAM policy permissions).
- `roles/serviceusage.serviceUsageConsumer` on the project.
- `roles/cloudtasks.queueAdmin` on the project, for creating/configuring the agent queue.
- `roles/artifactregistry.writer` on the `atlas` repository.
- `roles/iam.serviceAccountUser` on the `atlas-runtime` service account.

Give `atlas-runtime` `roles/aiplatform.user` on the project used in `VERTEX_PROJECT`. Cloud Run
supplies Application Default Credentials; do not upload a downloaded credential JSON file.

Also give `atlas-runtime` `roles/cloudtasks.enqueuer` on the project and
`roles/iam.serviceAccountUser` on its own service-account resource (it enqueues jobs using
that identity). These IAM grants are a one-time administrator setup, not performed by CI.
The Cloud Tasks service agent needs its normal `roles/cloudtasks.serviceAgent` grant to mint
OIDC tokens. `deploy/cloud-run.sh` creates the bounded `atlas-agent` queue if absent and wires
its project, location, API URL and service-account audience into the backend revision.

The worker endpoints validate Google OIDC tokens from exactly `AGENT_TASKS_SERVICE_ACCOUNT`
and the `AGENT_TASKS_API_URL` audience. End-user JWTs cannot run jobs. Keep hosted
`AGENT_EXECUTION_BACKEND=cloud_tasks`; the development database-polling worker requires
CPU outside requests and must not be used with scale-to-zero request-based Cloud Run.

### Trust GitHub without a service-account key

Create a Workload Identity pool and OIDC provider for `https://token.actions.githubusercontent.com`.
For `harsh-jos/atlas`, the repository ID is `1248214103` and owner ID is `106647285` (checked
2026-10-24). Map `google.subject=assertion.sub` and
`attribute.repository_id=assertion.repository_id`. Restrict the provider with:

```text
assertion.repository_id == '1248214103' && assertion.repository_owner_id == '106647285' && assertion.ref == 'refs/heads/main'
```

Bind `roles/iam.workloadIdentityUser` on `atlas-deploy` to the pool's principal set for that
repository ID. Use the **project number**, not project ID, in the principal-set URI:

```text
principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/atlas-github/attribute.repository_id/1248214103
```

The provider resource name will look like:

```text
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/atlas-github/providers/github
```

Do not grant trust to every GitHub repository or PR branch. A GitHub Environment with protected
`main` deployment rules can be added later, but is not required by this workflow.

## 3. Configure GitHub Actions

In the repository, open Settings → Secrets and variables → Actions. Create these **variables**:

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `polar-ensign-512612-b4` |
| `GCP_REGION` | `asia-northeast1` |
| `GCP_WIF_PROVIDER` | Full provider resource name from above |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `atlas-deploy@polar-ensign-512612-b4.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | `atlas-runtime@polar-ensign-512612-b4.iam.gserviceaccount.com` |
| `ATLAS_PUBLIC_APP_URL` | Optional existing custom-domain URL; otherwise leave unset |
| `GCP_DEPLOY_ENABLED` | Keep unset or `false` until all other setup is complete; then set `true` |

Copy `deploy/backend.env.example.yaml` and `deploy/web.env.example.yaml` outside the repository
and fill them in. Quote all numeric/boolean-looking values as YAML strings. Then create two
**GitHub Actions secrets** with the complete YAML contents:

| Secret | Contents |
| --- | --- |
| `ATLAS_BACKEND_ENV` | Backend runtime YAML, including `DATABASE_URL` and `SUPABASE_SERVICE_KEY` |
| `ATLAS_WEB_ENV` | Frontend runtime YAML with project URL and publishable key; no backend credentials |

Both files must select Supabase auth and the same project URL. The backend must select Supabase
Storage and provide the private bucket name, the session-pooler URL with TLS, and `VERTEX_PROJECT`.
Do not put the Google OAuth client secret into either file; that stays in Supabase's Google provider.

These values become Cloud Run environment variables. Google recommends Secret Manager for secrets,
but it is optional for this demo. Users with permission to inspect service configuration can read
runtime environment values. No credential values are baked into Docker images. CI writes the YAML
files outside its checkout and removes them afterwards; generated OIDC credential files are excluded
from Git and Docker build contexts.

## 4. Automatic deployment

The existing workflow now has backend, frontend, and deployment jobs:

1. Every PR/push runs backend tests against a disposable local Postgres service and runs frontend
   lint, type-checking, and a production build. No Supabase credentials are available to these jobs.
2. After checks pass, pushes to `main` deploy only when `GCP_DEPLOY_ENABLED=true`. Manual runs
   from the Actions tab also require `main` and the flag. PRs never deploy.
3. The deployment job builds both containers before authentication and before touching the live DB.
4. Workload Identity Federation impersonates `atlas-deploy`, then pushes both images to Artifact Registry.
5. The deployment script checks/creates its Cloud Tasks queue before touching the live database.
   Missing API/IAM setup stops here. It then applies all pending Alembic revisions from the GitHub
   runner against Supabase. No manual SQL or Cloud Run migration job is required.
6. The API deploys, then the web service. The script discovers service URLs and sets `ATLAS_API_URL`
   and `APP_URL`. Migration/API failures prevent later rollout steps. Production deployments are serialized.

A failed migration stops rollout. Schema changes still need to be compatible with the previous
service revision during rollout. Source code is trusted on `main`; use PR review/branch protection
if other people can contribute. Supabase free-plan inactivity pausing can require a manual resume
before running a deployment.

After the first deployment, set Supabase's Site URL to the web URL and add the exact
`WEB_URL/auth/callback` redirect URL. Keep `http://localhost:3000/auth/callback` for local testing.
Later deployments retain the same Cloud Run service URLs. Cloud Run's API health endpoints are
public; data routes require a valid user token. Next.js forwards credentials and unbuffered SSE
server-side. The first web deployment is briefly unconfigured until its discovered URLs are applied.

### Manual fallback

With Docker, gcloud, and backend dependencies installed locally, the same script can build/push
images, run migrations, and deploy without GitHub:

```bash
export PROJECT_ID=polar-ensign-512612-b4
export REGION=asia-northeast1
export RUNTIME_SERVICE_ACCOUNT="atlas-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export BACKEND_ENV_FILE=/absolute/path/outside/repo/backend.yaml
export WEB_ENV_FILE=/absolute/path/outside/repo/web.yaml
bash deploy/cloud-run.sh
```

The caller needs equivalent deployment permissions. For prebuilt images, set both `API_IMAGE`
and `WEB_IMAGE`; the script then skips local building/pushing. Local env files and hosted secrets
are never read by the PR test fixtures.

## Defaults and trade-offs

- Both services: request-based CPU, zero minimum instances, maximum one instance. Cold starts
  are expected. API timeout is 1800 seconds for Cloud Tasks jobs; web SSE timeout is 600 seconds and reconnects safely.
- Agent: 900-second turn timeout, leaving time for database cleanup before Cloud Run's deadline.
- API: concurrency 8, one CPU, 1 GiB RAM. Web: concurrency 20, one CPU, 512 MiB RAM.
- Application and ADK each get their own pool of two connections per API instance, no overflow:
  at most four pooled connections on the API instance, plus migration/administrative access.
- Per-user storage allowance: 50 MiB. Image maximum: 10 MiB. Agent session estimated-spending
  guard: $1. These application guards do not impose a hard provider billing cap.

The free Supabase plan currently has a 500 MB database and 1 GB file storage; embeddings and
chat event history count toward database size. Free projects can pause after a week of inactivity.
Check the dashboard before a demo. Cloud Run, registry storage, network traffic, GitHub Actions usage,
and model calls have separate quotas/pricing; these settings do not guarantee a $0 bill.
Use GCP budget alerts and your credits. No heartbeat traffic is used to keep either provider awake.

## Stream lifetime and recovery

Submitting a turn persists it and schedules an OIDC-authenticated Cloud Tasks job. SSE
observes the durable event log; multiple tabs can observe and closing them does not cancel
work. Stop signals the worker. Completed answers schedule a separate concept-enrichment job.
See [agent-runtime.md](agent-runtime.md) for leases, fencing, dispatch retry and accounting.

Closing the browser leaves the Cloud Tasks worker request running. Reconnection replays
saved progress without a second provider call. A service crash leaves partial work and
uncertain usage intact; expired execution leases become interrupted rather than being replayed.
Queued work can wait up to an hour; execution leases last the configured timeout plus 30 seconds.

## Existing local data

Changing a connection URL does not copy your local database or uploads. For a fresh demo, leave
local data untouched and create new hosted accounts. If you want existing content in Supabase,
back up the local database and upload directory first, then copy the Atlas and ADK tables using
Postgres tooling; do not replace Supabase's managed schemas. Run database setup against the
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

1. Confirm the workflow migration step succeeds and API `/healthz` returns 200.
2. Sign in with Google; reload the page and verify the session remains available.
3. Send a chat; verify text and tool events arrive incrementally through the web service.
4. Upload, read, and delete an image. A second account must receive 404 for its URL.
5. Close a chat stream during generation; reopen and verify the same worker continues, then test Stop.
6. Revisit after a cold start. No local files or process memory should be required to restore data.

Local automated checks cover the migrations, signed Supabase tokens (including wrong issuer,
audience, expiry, and signatures), ownership, Storage REST behavior with a fake service, real
ASGI disconnect cleanup, and Postgres-backed streaming. Actual Google OAuth, Supabase's hosted
pooler, and a deployed Cloud Run stream require your project credentials and a live smoke check.

Sources: [GitHub OIDC authentication](https://github.com/google-github-actions/auth),
[Cloud Run environment variables](https://cloud.google.com/run/docs/configuring/services/environment-variables),
[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[JWT keys](https://supabase.com/docs/guides/auth/signing-keys),
[database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Storage API](https://supabase.com/docs/reference/self-hosting-storage),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[pricing](https://supabase.com/pricing),
[Cloud Run timeouts](https://cloud.google.com/run/docs/configuring/request-timeout).
