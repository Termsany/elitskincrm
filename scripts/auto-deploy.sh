#!/usr/bin/env bash
# Brings the VPS to origin/main: fast-forwards the local checkout, rebuilds
# the app image and redeploys. Run by the GitHub "Deploy to VPS" workflow
# (and safe to run by hand or from cron).
#
# What counts as "deployed" is the commit recorded in .git/deployed-sha,
# written only after a build + health check succeeded — NOT the checkout's
# HEAD. So a failed build is retried on the next run instead of being
# reported as "up to date" while the old version keeps running.
#
# Safe by design: never force-resets over local history, refuses to touch a
# dirty working tree, and only swaps containers after a successful build (a
# failed build leaves the currently running app untouched).
set -euo pipefail
cd /opt/elite-crm

log() { echo "$(date -uIs) $*"; }

# Puts a failure message in every active admin's notification bell inside the app (best effort).
notify_admins() {
  printf '%s\n' "INSERT INTO task_notifications(user_id, task_id, kind, message, action_url) SELECT id, NULL, 'deploy_failed', :'msg', '/' FROM users WHERE role::text='admin' AND active=true;" \
    | docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -v msg="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' _ "$1" >/dev/null 2>&1 || true
}
fail() { log "FAIL: $1"; notify_admins "⚠ تحديث البرنامج على السيرفر فشل: $2"; exit 1; }

# One deploy at a time (workflow runs and manual/cron runs can overlap).
exec 9>.git/deploy.lock
if ! flock -w 900 9; then
  log "FAIL: another deploy is still running after 15 min — giving up."
  exit 1
fi

state_file=.git/deployed-sha
self_sum="$(sha1sum < "$0")"

git fetch origin main --quiet
remote_head="$(git rev-parse origin/main)"
deployed="$(cat "$state_file" 2>/dev/null || echo none)"

if [ "$deployed" = "$remote_head" ]; then
  log "up to date ($remote_head)"
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  fail "working tree has uncommitted changes — refusing to auto-deploy over them. Resolve manually." "فيه تعديلات يدوية على السيرفر منعت التحديث. النسخة القديمة لسه شغالة."
fi

# Fast-forward only: never discards commits, never force-overwrites history.
if ! git merge --ff-only origin/main --quiet; then
  fail "local main has diverged from origin/main (not a fast-forward) — needs manual resolution." "نسخة السيرفر مختلفة عن GitHub ومحتاجة تدخل يدوي. النسخة القديمة لسه شغالة."
fi

# this script may have just been updated by the merge: run the new version (once) so fixes apply now
if [ -z "${DEPLOY_REEXEC:-}" ] && [ "$(sha1sum < "$0")" != "$self_sum" ]; then
  log "deploy script changed — running the new version"
  exec 9>&-
  DEPLOY_REEXEC=1 exec bash "$0" "$@"
fi

log "deploying $deployed -> $remote_head"

# free disk space: every release leaves an old image and build cache behind (tagged images such as :good are kept)
log "disk before cleanup: $(df -h / | awk 'NR==2{print $4" free of "$2}')"
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
log "disk after cleanup: $(df -h / | awk 'NR==2{print $4" free of "$2}')"

# the database must be healthy before the app can start (a full disk or a crash leaves it unhealthy)
db_ok() { [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q db)" 2>/dev/null)" = "healthy" ]; }
if ! db_ok; then
  log "database is not healthy — logs:"
  docker compose logs --no-color --tail 60 db 2>&1 || true
  log "restarting the database"
  docker compose up -d db || docker compose restart db || true
  for i in $(seq 1 45); do db_ok && break; sleep 2; done
  db_ok && log "database is healthy again" || log "database still unhealthy"
fi

if ! docker compose build app; then
  fail "image build failed for $remote_head — currently running app left untouched; will retry on the next run." "بناء النسخة الجديدة فشل (${remote_head:0:7}). النسخة القديمة لسه شغالة."
fi

# The new release failed to come up: show why (in the GitHub job log), then put the previous image back so the site stays up.
rollback() {
  log "disk: $(df -h / | awk 'NR==2{print $4" free of "$2}')"
  docker compose ps 2>&1 || true
  log "db logs (last 40 lines):"
  docker compose logs --no-color --tail 40 db 2>&1 || true
  log "app logs (last 120 lines):"
  docker compose logs --no-color --tail 120 app 2>&1 || true
  if docker image inspect elite-crm-app:good >/dev/null 2>&1; then
    log "rolling back to the last good image"
    docker image tag elite-crm-app:good elite-crm-app
    docker compose up -d --no-build app reminders || true
    for i in $(seq 1 60); do curl -fs -m 3 http://127.0.0.1:3100/api/health >/dev/null 2>&1 && { log "previous version is back up"; break; }; sleep 2; done
  fi
  fail "$remote_head did not come up healthy — rolled back to the previous version; will retry on the next push." "النسخة الجديدة (${remote_head:0:7}) ماشتغلتش، فرجعت النسخة اللي قبلها تلقائياً والبرنامج شغال."
}

# `up` waits for the app's health check (reminders depend on it); a failure here must not skip the rollback
docker compose up -d app reminders || rollback

for i in $(seq 1 30); do
  if curl -fs -m 3 http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    echo "$remote_head" > "$state_file"
    # remember this image as the one to roll back to if a later release doesn't come up
    docker image tag elite-crm-app elite-crm-app:good || true
    log "OK: deployed $remote_head, health check passed"
    # Daftra link status for the job log: whether the keys are set (never their values) and the last sync
    docker compose exec -T app sh -c 'echo "daftra subdomain: $([ -n "$DAFTRA_SUBDOMAIN" ] && echo set || echo MISSING), api key: $([ -n "$DAFTRA_API_KEY" ] && echo set || echo MISSING)"' 2>/dev/null || true
    printf '%s\n' "SELECT 'daftra sync: ok=' || coalesce(ok::text,'never') || ', finished=' || coalesce(finished_at::text,'never') || ', invoices in db=' || (SELECT count(*) FROM daftra_invoices) || ', message=' || message FROM daftra_sync WHERE id=1;" \
      | docker compose exec -T db sh -c 'psql -qtA -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null || true
    exit 0
  fi
  sleep 2
done
rollback
