#!/usr/bin/env bash
# Deploy SoloFlow static site (repo website/) to a VPS via rsync + SSH.
# Requires: PubkeyAuthentication on the server (BatchMode / non-interactive).
#
# If you see "Permission denied (password)" or verbose shows only "password"
# in "Authentications that can continue", enable keys on the server:
#   sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
#   systemctl reload sshd   # or ssh.service
# Then: ssh-copy-id -p PORT -i ~/.ssh/id_ed25519.pub root@HOST
#
# Usage:
#   export DEPLOY_PATH=/var/www/html   # or your nginx root for soloflow
#   ./scripts/deploy-website-remote.sh
#
# Optional env: DEPLOY_HOST DEPLOY_PORT DEPLOY_USER (defaults below)

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-45.133.239.200}"
DEPLOY_PORT="${DEPLOY_PORT:-29892}"
DEPLOY_USER="${DEPLOY_USER:-root}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO_ROOT}/website/"

if [[ -z "${DEPLOY_PATH:-}" ]]; then
  echo "ERROR: Set DEPLOY_PATH to the web root on the server (e.g. /var/www/html)." >&2
  echo "Discover example: ssh -p ${DEPLOY_PORT} ${DEPLOY_USER}@${DEPLOY_HOST} \"nginx -T 2>/dev/null | grep -E 'server_name|root '\" >&2
  exit 1
fi

SSH_CMD=(ssh -p "${DEPLOY_PORT}" -o BatchMode=yes -o ConnectTimeout=20 "${DEPLOY_USER}@${DEPLOY_HOST}")
RSYNC_RSH="ssh -p ${DEPLOY_PORT} -o BatchMode=yes -o ConnectTimeout=20"

echo "==> Testing SSH (key auth)..."
"${SSH_CMD[@]}" "echo ok"

echo "==> rsync ${SRC} -> ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
rsync -avz --delete -e "$RSYNC_RSH" "${SRC%/}/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "==> Reload web server (if present)..."
"${SSH_CMD[@]}" "systemctl reload nginx 2>/dev/null || systemctl reload caddy 2>/dev/null || true"

echo "Done. Verify: curl -sI https://soloflow.pmparker.net/ | head -5"
