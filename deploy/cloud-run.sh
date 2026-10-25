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
wait_for_pair() {
  local first_status=0 second_status=0
  wait "$1" || first_status=$?
  wait "$2" || second_status=$?
  if (( first_status != 0 )); then return "$first_status"; fi
  return "$second_status"
}
if [[ -z "${API_IMAGE:-}" && -z "${WEB_IMAGE:-}" ]]; then
  TAG="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
  IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/atlas"
  API_IMAGE="${IMAGE_BASE}/api:${TAG}"
  WEB_IMAGE="${IMAGE_BASE}/web:${TAG}"
  docker build -t "$API_IMAGE" backend &
  API_BUILD_PID=$!
  docker build -t "$WEB_IMAGE" . &
  WEB_BUILD_PID=$!
  wait_for_pair "$API_BUILD_PID" "$WEB_BUILD_PID"
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker push "$API_IMAGE" &
  API_PUSH_PID=$!
  docker push "$WEB_IMAGE" &
  WEB_PUSH_PID=$!
  wait_for_pair "$API_PUSH_PID" "$WEB_PUSH_PID"
fi
: "${API_IMAGE:?Set both API_IMAGE and WEB_IMAGE, or neither}"
: "${WEB_IMAGE:?Set both API_IMAGE and WEB_IMAGE, or neither}"
# Resolve infrastructure prerequisites before changing the live schema or API revision.
# API enablement and IAM grants are administrator setup; CI does not broaden its own roles.
# Durable HTTP jobs use OIDC; the worker endpoint validates this exact service identity.
if ! gcloud tasks queues describe atlas-agent --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  gcloud tasks queues create atlas-agent --project "$PROJECT_ID" --location "$REGION" \
    --max-concurrent-dispatches 4 --max-dispatches-per-second 2 --max-attempts 8 --min-backoff 5s --max-backoff 120s
fi
# Existing services keep their established URL. New services use Cloud Run's documented
# deterministic URL so their first revision can also receive its full configuration.
API_URL="$(gcloud run services describe atlas-api --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
WEB_URL="$(gcloud run services describe atlas-web --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
if [[ -z "$API_URL" || -z "$WEB_URL" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  if [[ ! "$PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
    echo 'Could not resolve the project number for the initial service URLs.' >&2
    exit 1
  fi
  API_URL="${API_URL:-https://atlas-api-${PROJECT_NUMBER}.${REGION}.run.app}"
  WEB_URL="${WEB_URL:-https://atlas-web-${PROJECT_NUMBER}.${REGION}.run.app}"
fi
export ATLAS_RESOLVED_API_URL="$API_URL" ATLAS_RESOLVED_WEB_URL="$WEB_URL"
DEPLOY_CONFIG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/atlas-deploy.XXXXXX")"
trap 'rm -rf "$DEPLOY_CONFIG_DIR"' EXIT
"$ATLAS_DEPLOY_PYTHON" deploy/runtime_config.py --render-dir "$DEPLOY_CONFIG_DIR"
# Only run after both images have built and published successfully.
"$ATLAS_DEPLOY_PYTHON" deploy/runtime_config.py
gcloud run deploy atlas-api --project "$PROJECT_ID" --region "$REGION" \
  --image "$API_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$DEPLOY_CONFIG_DIR/backend.yaml" --allow-unauthenticated --port 8080 \
  --timeout 1800s --concurrency 8 --min-instances 0 --max-instances 1 \
  --cpu 1 --memory 1Gi --cpu-throttling \
  --startup-probe httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=0,periodSeconds=10,timeoutSeconds=5,failureThreshold=12
gcloud run deploy atlas-web --project "$PROJECT_ID" --region "$REGION" \
  --image "$WEB_IMAGE" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --env-vars-file "$DEPLOY_CONFIG_DIR/web.yaml" --allow-unauthenticated --port 8080 \
  --timeout 600s --concurrency 20 --min-instances 0 --max-instances 1 \
  --cpu 1 --memory 512Mi --cpu-throttling
printf '\nAtlas: %s\nAdd %s/auth/callback to Supabase redirect URLs before signing in.\n' "${PUBLIC_APP_URL:-$WEB_URL}" "${PUBLIC_APP_URL:-$WEB_URL}"
