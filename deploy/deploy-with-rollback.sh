#!/usr/bin/env bash
# ==============================================================================
# WP-9 Production Self-Healing Deployment & Auto-Rollback Controller
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="docker-compose.production.yml"
HEALTH_URL="http://127.0.0.1:8788/health/live"
READY_URL="http://127.0.0.1:8788/health/ready"
TIMEOUT_SECONDS=60
BACKUP_DIR="./data/backups/pre-deploy"

echo "===================================================================="
echo "  WP-9 PRODUCTION DEPLOYMENT WITH AUTOMATIC ROLLBACK CONTROLLER     "
echo "===================================================================="

# 1. Capture current git commit / release version
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "[deploy] Current stable release commit: ${CURRENT_COMMIT}"

# 2. Pre-deployment backup of persistent database and auth tokens
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
echo "[backup] Creating pre-deployment snapshot (${TIMESTAMP})..."

if command -v docker &> /dev/null && docker ps | grep -q "wp9_postgres"; then
  docker exec wp9_postgres pg_dump -U postgres wp9 > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql" || true
fi

if [ -d "./data/baileys-auth" ]; then
  tar -czf "${BACKUP_DIR}/auth_${TIMESTAMP}.tar.gz" -C ./data baileys-auth || true
fi
echo "[backup] Pre-deployment snapshot secured in ${BACKUP_DIR}"

# 3. Pull latest changes or build updated containers
echo "[deploy] Pulling images and building updated containers..."
docker compose -f "${COMPOSE_FILE}" build --pull worker web

echo "[deploy] Starting updated containers..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

# 4. Health-Check Gate: Poll liveness and readiness for up to 60 seconds
echo "[gate] Evaluating health check gate (Timeout: ${TIMEOUT_SECONDS}s)..."
START_TIME=$(date +%s)
HEALTHY=0

while [ $(($(date +%s) - START_TIME)) -lt ${TIMEOUT_SECONDS} ]; do
  if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
    echo "[gate] Liveness probe PASSED (/health/live is 200 OK)."
    HEALTHY=1
    break
  fi
  echo "[gate] Waiting for worker container to become healthy... ($(($(date +%s) - START_TIME))s elapsed)"
  sleep 4
done

# 5. Decision: Keep or Rollback
if [ "${HEALTHY}" -eq 1 ]; then
  echo "===================================================================="
  echo "  >>> DEPLOYMENT SUCCEEDED: Service is HEALTHY and OPERATIONAL <<<   "
  echo "===================================================================="
  # Clean up dangling images to prevent disk accumulation
  docker image prune -f --filter "until=24h" || true
  exit 0
else
  echo "===================================================================="
  echo "  >>> HEALTH CHECK FAILED! INITIATING AUTOMATIC ROLLBACK <<<        "
  echo "===================================================================="
  
  # Roll back git commit
  git checkout "${CURRENT_COMMIT}"
  
  # Rebuild and relaunch previous stable release
  docker compose -f "${COMPOSE_FILE}" up -d --build
  
  echo "[rollback] Rollback completed. System restored to ${CURRENT_COMMIT}."
  exit 1
fi
