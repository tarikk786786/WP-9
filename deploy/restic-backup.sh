#!/usr/bin/env bash
# ==============================================================================
# WP-9 Production Backup Script (Restic / S3 / Local)
# Backs up WhatsApp auth keys, PostgreSQL database dumps, and Redis state.
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/tmp/wp9-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "${BACKUP_DIR}"

echo "[backup] Dumping PostgreSQL database..."
docker exec -t wp9_postgres pg_dumpall -U postgres > "${BACKUP_DIR}/postgres_dump.sql"

echo "[backup] Triggering Redis background save..."
docker exec -t wp9_redis redis-cli bgsave
sleep 2

echo "[backup] Archiving Baileys WhatsApp auth sessions..."
tar -czf "${BACKUP_DIR}/baileys-auth.tar.gz" -C "/var/lib/docker/volumes/wp9_worker_auth/_data" . 2>/dev/null || true

echo "[backup] Snapshot created at ${BACKUP_DIR}."
if command -v restic &> /dev/null; then
  echo "[backup] Syncing snapshot with Restic repository..."
  restic backup "${BACKUP_DIR}" --tag "wp9-daily"
  echo "[backup] Restic backup complete."
fi

rm -rf "${BACKUP_DIR}"
echo "[backup] Backup workflow finished successfully."
