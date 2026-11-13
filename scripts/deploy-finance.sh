#!/usr/bin/env bash
# Brings up the separate finance app (finance/, docker project "elite-finance",
# 127.0.0.1:3200 → finance.eliteskinsa.com). Called by auto-deploy.sh after the
# CRM side is done; it never touches the CRM containers, and a failure here is
# only logged — it never fails the CRM deploy.
#
# Idempotent: rebuilds only when finance/ changed (tree hash) or the app is down;
# sets up the nginx site and the HTTPS certificate once, when they are missing.
set -uo pipefail
cd /opt/elite-crm

log() { echo "$(date -uIs) [finance] $*"; }

DOMAIN=finance.eliteskinsa.com
ENV_FILE=/opt/elite-finance.env
STATE=.git/finance-deployed-tree
COMPOSE=(docker compose -p elite-finance -f finance/docker-compose.yml)
export FINANCE_ENV_FILE="$ENV_FILE"

[ -d finance ] || { log "no finance/ folder — skipping"; exit 0; }

# --- 1) settings file (outside git; created once, never overwritten) -----------
crm_env() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -1 | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }
q() { case "$1" in *"'"*) printf '%s' "$1" ;; *) printf "'%s'" "$1" ;; esac; }
if [ ! -f "$ENV_FILE" ]; then
  pw="$(crm_env BOOTSTRAP_ADMIN_PASSWORD)"
  [ -n "$pw" ] || pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
  umask 077
  {
    echo "# Finance app settings — edit, then: cd /opt/elite-crm && FINANCE_ENV_FILE=$ENV_FILE docker compose -p elite-finance -f finance/docker-compose.yml up -d"
    echo "# Initial password = the CRM's BOOTSTRAP_ADMIN_PASSWORD."
    echo "APP_PASSWORD=$(q "$pw")"
    echo "SESSION_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')"
    echo "CURRENCY=$(q 'ج.م')"
    echo "DAFTRA_SUBDOMAIN=$(q "$(crm_env DAFTRA_SUBDOMAIN)")"
    echo "DAFTRA_APIKEY=$(q "$(crm_env DAFTRA_API_KEY)")"
  } > "$ENV_FILE"
  log "created $ENV_FILE (password = CRM bootstrap admin password; Daftra copied from CRM .env)"
fi

# --- 2) build + run when finance/ changed or the app is not healthy ------------
healthy() { curl -fs -m 3 http://127.0.0.1:3200/api/health >/dev/null 2>&1; }
tree="$(git rev-parse HEAD:finance)"
if [ "$(cat "$STATE" 2>/dev/null)" = "$tree" ] && healthy; then
  log "up to date ($tree)"
else
  log "deploying finance tree $tree"
  if ! "${COMPOSE[@]}" build app; then log "FAIL: build failed — running version left as is"; exit 1; fi
  "${COMPOSE[@]}" up -d app
  ok=""
  for i in $(seq 1 30); do if healthy; then ok=1; break; fi; sleep 2; done
  if [ -z "$ok" ]; then log "FAIL: health check did not pass in 60s"; exit 1; fi
  echo "$tree" > "$STATE"
  log "OK: running on 127.0.0.1:3200"
fi

# --- 3) nginx site (once) ------------------------------------------------------
SITE=/etc/nginx/sites-available/elite-finance
if command -v nginx >/dev/null 2>&1 && [ ! -e "$SITE" ]; then
  cp finance/deploy/nginx.conf.example "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/elite-finance
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx && log "nginx site for $DOMAIN enabled"
  else
    rm -f /etc/nginx/sites-enabled/elite-finance "$SITE"
    log "FAIL: nginx -t rejected the finance site — removed it, nginx untouched"
  fi
fi

# --- 4) HTTPS certificate (once DNS points here) --------------------------------
if [ -e "$SITE" ] && command -v certbot >/dev/null 2>&1 && [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  dns_ip="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
  if [ -n "$dns_ip" ] && ip -4 -o addr show | grep -qw "$dns_ip"; then
    if certbot --nginx -d "$DOMAIN" --redirect --non-interactive --keep-until-expiring >/dev/null 2>&1; then
      log "HTTPS certificate issued for $DOMAIN"
    else
      log "certbot failed for $DOMAIN — will retry on the next deploy"
    fi
  else
    log "waiting for DNS: $DOMAIN → this server (now: ${dns_ip:-none})"
  fi
fi
exit 0
