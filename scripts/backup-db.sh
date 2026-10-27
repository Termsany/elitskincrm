#!/usr/bin/env bash
# Daily logical backup of the Elite CRM Postgres database.
# Dumps from the running db container, gzips atomically, verifies the archive,
# and prunes backups older than the retention window.
set -euo pipefail

CONTAINER="elite-crm-db-1"
DB="elite_crm"
DB_USER="elite_crm"
BACKUP_DIR="/opt/elite-crm/backups/daily"
RETENTION_DAYS=14

TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/elite_crm-${TS}.sql.gz"
TMP="${OUT}.part"

log() { echo "$(date -uIs) $*"; }

mkdir -p "$BACKUP_DIR"

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  log "FAIL: container $CONTAINER is not running"
  exit 1
fi

if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" --clean --if-exists | gzip -c > "$TMP"; then
  if [ -s "$TMP" ] && gzip -t "$TMP" 2>/dev/null; then
    mv "$TMP" "$OUT"
    log "OK: $OUT ($(du -h "$OUT" | cut -f1))"
  else
    rm -f "$TMP"
    log "FAIL: dump was empty or corrupt"
    exit 1
  fi
else
  rm -f "$TMP"
  log "FAIL: pg_dump returned an error"
  exit 1
fi

deleted="$(find "$BACKUP_DIR" -maxdepth 1 -name 'elite_crm-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
log "retention: removed ${deleted} backup(s) older than ${RETENTION_DAYS} day(s)"
