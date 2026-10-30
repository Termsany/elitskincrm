#!/usr/bin/env bash
# Daily backup of uploaded files kept on disk (visit & task attachments) — the DB dump does not include them.
# Restore: docker run --rm -v elite-crm_uploads:/u -v /opt/elite-crm/backups/uploads:/b postgres:16-alpine sh -c "cd /u && tar xzf /b/<file>.tar.gz"
set -euo pipefail
VOLUME="elite-crm_uploads"
BACKUP_DIR="/opt/elite-crm/backups/uploads"
RETENTION_DAYS=14
TS="$(date -u +%Y%m%d-%H%M%S)"
NAME="uploads-${TS}.tar.gz"
log() { echo "$(date -uIs) $*"; }
mkdir -p "$BACKUP_DIR"
if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then log "FAIL: volume $VOLUME not found"; exit 1; fi
docker run --rm -v "${VOLUME}:/u:ro" -v "${BACKUP_DIR}:/b" postgres:16-alpine sh -c "cd /u && tar czf /b/${NAME}.part . && gzip -t /b/${NAME}.part"
mv "${BACKUP_DIR}/${NAME}.part" "${BACKUP_DIR}/${NAME}"
FILES=$(tar tzf "${BACKUP_DIR}/${NAME}" | grep -vc '/$' || true)
log "OK: ${BACKUP_DIR}/${NAME} ($(du -h "${BACKUP_DIR}/${NAME}" | cut -f1), ${FILES} files)"
deleted="$(find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
log "retention: removed ${deleted} archive(s) older than ${RETENTION_DAYS} day(s)"
