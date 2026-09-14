#!/usr/bin/env bash
# Aerion installer — one-command setup for a fresh Ubuntu VPS.
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/mysxmass-alt/aerion-control-plane/main/install.sh)
#
# Optional environment variables:
#   AERION_DOMAIN=panel.example.com
#   AERION_REPO_URL=https://github.com/owner/repo.git
#   AERION_SAME_BOX=yes|no
#   AERION_NODE_AGENT_URL=https://node.example.com
#   AERION_NODE_AGENT_TOKEN=...
set -euo pipefail

readonly DEFAULT_REPO_URL="https://github.com/mysxmass-alt/aerion-control-plane.git"
readonly CLONE_DIR="/tmp/aerion-src"
readonly PNPM_VERSION="10.4.1"

if [[ "${EUID}" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required. Run this on Ubuntu as a sudo-capable user." >&2
  exit 1
fi

# Alibaba Cloud images commonly open the SSH session as root. The deployment
# scripts still use sudo for portability, so keep it when available and use an
# existing ubuntu account for services; otherwise root is a valid fallback.
if [[ -z "${AERION_USER:-}" ]]; then
  if [[ "${EUID}" -eq 0 ]]; then
    AERION_USER="$(getent passwd ubuntu >/dev/null && printf ubuntu || printf root)"
  else
    AERION_USER="${SUDO_USER:-${USER}}"
  fi
fi
export AERION_USER

REPO_URL="${AERION_REPO_URL:-$DEFAULT_REPO_URL}"
DOMAIN="${AERION_DOMAIN:-}"
SAME_BOX="${AERION_SAME_BOX:-}"
NODE_AGENT_URL="${AERION_NODE_AGENT_URL:-}"
NODE_AGENT_TOKEN="${AERION_NODE_AGENT_TOKEN:-}"

printf '%s\n' '=================================================='
printf '%s\n' ' Aerion control plane — installer'
printf '%s\n\n' '=================================================='
printf 'Repository: %s\n' "$REPO_URL"

if [[ -z "$DOMAIN" ]]; then
  read -r -p "Domain for the panel (e.g. panel.example.com): " DOMAIN
fi
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]]; then
  echo "Invalid domain: $DOMAIN" >&2
  exit 1
fi

if [[ -z "$SAME_BOX" ]]; then
  read -r -p "Run the Docker node agent on this same VPS? [Y/n]: " SAME_BOX
  SAME_BOX="${SAME_BOX:-Y}"
fi

if [[ "$SAME_BOX" =~ ^[Yy] ]]; then
  SAME_BOX=yes
else
  SAME_BOX=no
  if [[ -z "$NODE_AGENT_URL" ]]; then
    read -r -p "URL of the remote node agent (e.g. https://node.example.com): " NODE_AGENT_URL
  fi
  if [[ -z "$NODE_AGENT_TOKEN" ]]; then
    read -r -s -p "Node agent token: " NODE_AGENT_TOKEN
    printf '\n'
  fi
  [[ -n "$NODE_AGENT_URL" && -n "$NODE_AGENT_TOKEN" ]] || { echo "Remote node agent URL and token are required." >&2; exit 1; }
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl tar

printf '%s\n' '--> Cloning Aerion'
rm -rf "$CLONE_DIR"
git clone --depth 1 "$REPO_URL" "$CLONE_DIR"
cd "$CLONE_DIR"
chmod +x install.sh scripts/*.sh

printf '%s\n' '--> Installing Docker, firewall, and fail2ban'
./scripts/bootstrap-node.sh

if [[ "$SAME_BOX" == yes ]]; then
  printf '%s\n' '--> Installing the local Docker node agent'
  openssl rand -hex 32 > /tmp/aerion-node-token
  cp node-agent/index.js /tmp/aerion-node-agent.js
  ./scripts/install-node-agent.sh
  NODE_AGENT_URL="http://127.0.0.1:8787"
  NODE_AGENT_TOKEN="$(cat /tmp/aerion-node-token)"
else
  printf '%s\n' "$NODE_AGENT_TOKEN" > /tmp/aerion-node-token
  chmod 600 /tmp/aerion-node-token
fi

printf '%s\n' '--> Installing Node.js 22 and pnpm'
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v pnpm >/dev/null 2>&1 || ! pnpm --version >/dev/null 2>&1; then
  sudo npm install --global --force "pnpm@${PNPM_VERSION}"
fi

printf '%s\n' '--> Installing dependencies and building the panel'
pnpm install --frozen-lockfile
pnpm run build

printf '%s\n' '--> Preparing deploy configuration'
cat > /tmp/aerion-deploy-config.txt <<EOF
DOMAIN=${DOMAIN}
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
NODE_AGENT_URL=${NODE_AGENT_URL}
EOF

printf '%s\n' '--> Packaging the panel build'
tar --exclude=node_modules --exclude=.git --exclude=data \
  -czf /tmp/aerion-panel.tar.gz dist package.json pnpm-lock.yaml \
  drizzle drizzle.config.ts shared server

printf '%s\n' '--> Installing the panel, database, nginx, and TLS'
./scripts/install-selfhost-panel.sh

printf '\n%s\n' '=================================================='
printf ' Done. Visit https://%s/login to create your admin account.\n' "$DOMAIN"
printf '%s\n' 'The first account created becomes the administrator.'
printf '%s\n' '=================================================='
