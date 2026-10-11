#!/usr/bin/env bash
# Run from any directory. Builds and deploys; does not create projects, IAM, or secrets.
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION (e.g. asia-south1)}"
: "${RUNTIME_SERVICE_ACCOUNT:?Set the dedicated runtime service account email}"
: "${BACKEND_ENV_FILE:?Set absolute path to backend environment YAML}"
: "${WEB_ENV_FILE:?Set absolute path to web environment YAML}"
[[ -f "$BACKEND_ENV_FILE" && -f "$WEB_ENV_FILE" ]] || { echo 'Environment files are missing' >&2; exit 1; }
cd "$(dirname "$0")/.."
TAG="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/atlas"
API_IMAGE="${IMAGE_BASE}/api:${TAG}"
WEB_IMAGE="${IMAGE_BASE}/web:${TAG}"
SECRETS='DATABASE_URL=atlas-database-url:latest,SUPABASE_SERVICE_KEY=atlas-supabase-service-key:latest'
gcloud builds submit --project "$PROJECT_ID" --config deploy/backend-build.yaml --substitutions "_IMAGE=${API_IMAGE}" .
gcloud builds submit --project "$PROJECT_ID" --config deploy/web-build.yaml --substitutions "_IMAGE=${WEB_IMAGE}" .
# Session-mode database URL is also used by the one-off migration job.
gcloud run jobs deploy atlas-migrate --project "$PROJECT_ID" --region "$REGION" \
  --image "$API_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$BACKEND_ENV_FILE" --set-secrets "$SECRETS" \
  --command python --args=-m,app.db.bootstrap --tasks 1 --parallelism 1 \
  --max-retries 0 --task-timeout 600s --memory 1Gi --cpu 1
gcloud run jobs execute atlas-migrate --project "$PROJECT_ID" --region "$REGION" --wait
gcloud run deploy atlas-api --project "$PROJECT_ID" --region "$REGION" \
  --image "$API_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$BACKEND_ENV_FILE" --set-secrets "$SECRETS" \
  --allow-unauthenticated --port 8080 --timeout 600s --concurrency 4 \
  --min-instances 0 --max-instances 2 --cpu 1 --memory 1Gi --cpu-throttling \
  --startup-probe httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=0,periodSeconds=10,timeoutSeconds=5,failureThreshold=12
API_URL="$(gcloud run services describe atlas-api --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
gcloud run deploy atlas-web --project "$PROJECT_ID" --region "$REGION" \
  --image "$WEB_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$WEB_ENV_FILE" --allow-unauthenticated --port 8080 \
  --timeout 600s --concurrency 20 --min-instances 0 --max-instances 2 \
  --cpu 1 --memory 512Mi --cpu-throttling
WEB_URL="$(gcloud run services describe atlas-web --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
gcloud run services update atlas-web --project "$PROJECT_ID" --region "$REGION" \
  --update-env-vars "ATLAS_API_URL=${API_URL},APP_URL=${PUBLIC_APP_URL:-$WEB_URL}"
printf '\nAtlas: %s\nAdd %s/auth/callback to Supabase redirect URLs before signing in.\n' "${PUBLIC_APP_URL:-$WEB_URL}" "${PUBLIC_APP_URL:-$WEB_URL}"
