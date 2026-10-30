#!/usr/bin/env bash
# Polls GitHub for new commits on main; when found, fast-forwards the local
# checkout, rebuilds the app image, and redeploys — fully automatic.
# Safe by design: never force-pushes/resets over local history, refuses to
# touch a dirty working tree, and only swaps containers after a successful
# build (a failed build leaves the currently running app untouched).
set -euo pipefail
cd /opt/elite-crm

log() { echo "$(date -uIs) $*"; }

git fetch origin main --quiet

local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse origin/main)"

if [ "$local_head" = "$remote_head" ]; then
  log "up to date ($local_head)"
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  log "FAIL: working tree has uncommitted changes — refusing to auto-deploy over them. Resolve manually."
  exit 1
fi

# Fast-forward only: never discards commits, never force-overwrites history.
if ! git merge --ff-only origin/main --quiet; then
  log "FAIL: local main has diverged from origin/main (not a fast-forward) — needs manual resolution."
  exit 1
fi

log "deploying $local_head -> $remote_head"

if ! docker compose build app; then
  log "FAIL: image build failed for $remote_head — currently running app left untouched."
  exit 1
fi

docker compose up -d app reminders

for i in $(seq 1 15); do
  if curl -fs -m 3 http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    log "OK: deployed $remote_head, health check passed"
    exit 0
  fi
  sleep 2
done

log "WARNING: deployed $remote_head but health check did not pass within 30s — check manually"
exit 1
