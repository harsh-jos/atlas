#!/usr/bin/env bash
# GitHub Actions supplies prebuilt images; local runs can build/push using Docker.
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION}"
: "${RUNTIME_SERVICE_ACCOUNT:?Set RUNTIME_SERVICE_ACCOUNT}"
: "${BACKEND_ENV_FILE:?Set absolute path to backend runtime YAML}"
: "${WEB_ENV_FILE:?Set absolute path to frontend runtime YAML}"
cd "$(dirname "$0")/.."
ATLAS_DEPLOY_PYTHON="${ATLAS_DEPLOY_PYTHON:-$PWD/backend/.venv/bin/python}"
"$ATLAS_DEPLOY_PYTHON" deploy/runtime_config.py --validate
if [[ -z "${API_IMAGE:-}" && -z "${WEB_IMAGE:-}" ]]; then
  TAG="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
  IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/atlas"
  API_IMAGE="${IMAGE_BASE}/api:${TAG}"
  WEB_IMAGE="${IMAGE_BASE}/web:${TAG}"
  docker build -t "$API_IMAGE" backend
  docker build -t "$WEB_IMAGE" .
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker push "$API_IMAGE"
  docker push "$WEB_IMAGE"
fi
: "${API_IMAGE:?Set both API_IMAGE and WEB_IMAGE, or neither}"
: "${WEB_IMAGE:?Set both API_IMAGE and WEB_IMAGE, or neither}"
# Only run after both images have built and published successfully.
"$ATLAS_DEPLOY_PYTHON" deploy/runtime_config.py
gcloud run deploy atlas-api --project "$PROJECT_ID" --region "$REGION" \
  --image "$API_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$BACKEND_ENV_FILE" --allow-unauthenticated --port 8080 \
  --timeout 600s --concurrency 4 --min-instances 0 --max-instances 1 \
  --cpu 1 --memory 1Gi --cpu-throttling \
  --startup-probe httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=0,periodSeconds=10,timeoutSeconds=5,failureThreshold=12
API_URL="$(gcloud run services describe atlas-api --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
gcloud run deploy atlas-web --project "$PROJECT_ID" --region "$REGION" \
  --image "$WEB_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$WEB_ENV_FILE" --allow-unauthenticated --port 8080 \
  --timeout 600s --concurrency 20 --min-instances 0 --max-instances 1 \
  --cpu 1 --memory 512Mi --cpu-throttling
WEB_URL="$(gcloud run services describe atlas-web --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
gcloud run services update atlas-web --project "$PROJECT_ID" --region "$REGION" \
  --update-env-vars "ATLAS_API_URL=${API_URL},APP_URL=${PUBLIC_APP_URL:-$WEB_URL}"
printf '\nAtlas: %s\nAdd %s/auth/callback to Supabase redirect URLs before signing in.\n' "${PUBLIC_APP_URL:-$WEB_URL}" "${PUBLIC_APP_URL:-$WEB_URL}"
