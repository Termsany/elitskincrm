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

log "deploying $deployed -> $remote_head"

if ! docker compose build app; then
  fail "image build failed for $remote_head — currently running app left untouched; will retry on the next run." "بناء النسخة الجديدة فشل (${remote_head:0:7}). النسخة القديمة لسه شغالة."
fi

docker compose up -d app reminders

for i in $(seq 1 30); do
  if curl -fs -m 3 http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    echo "$remote_head" > "$state_file"
    log "OK: deployed $remote_head, health check passed"
    exit 0
  fi
  sleep 2
done

fail "deployed $remote_head but health check did not pass within 60s — check manually; will redeploy on the next run." "النسخة الجديدة (${remote_head:0:7}) اتشغلت بس مش بترد صح — راجعها."
