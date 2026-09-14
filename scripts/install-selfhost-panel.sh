#!/usr/bin/env bash
# Installs the Aerion panel, MariaDB, nginx, and TLS.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

AERION_USER="${AERION_USER:-${SUDO_USER:-ubuntu}}"
PNPM_VERSION="${PNPM_VERSION:-10.4.1}"
CONFIG_FILE="${AERION_DEPLOY_CONFIG:-/tmp/aerion-deploy-config.txt}"
PANEL_ARCHIVE="${AERION_PANEL_ARCHIVE:-/tmp/aerion-panel.tar.gz}"

[[ -f "$CONFIG_FILE" ]] || { echo "Missing deploy config: $CONFIG_FILE" >&2; exit 1; }
[[ -f "$PANEL_ARCHIVE" ]] || { echo "Missing panel archive: $PANEL_ARCHIVE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${DOMAIN:?Set DOMAIN in $CONFIG_FILE}"
: "${DB_PASSWORD:?Set DB_PASSWORD in $CONFIG_FILE}"
: "${JWT_SECRET:?Set JWT_SECRET in $CONFIG_FILE}"
NODE_AGENT_URL="${NODE_AGENT_URL:-http://127.0.0.1:8787}"
NODE_TOKEN="$(cat /tmp/aerion-node-token)"

sudo apt-get update
sudo apt-get install -y mariadb-server nginx certbot python3-certbot-nginx
sudo systemctl enable --now mariadb
sudo mysql --batch <<SQL
CREATE DATABASE IF NOT EXISTS aerion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'aerion'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER 'aerion'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON aerion.* TO 'aerion'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

sudo install -d -o "$AERION_USER" -g "$AERION_USER" /opt/aerion-panel
sudo rm -rf /opt/aerion-panel/dist /opt/aerion-panel/package.json /opt/aerion-panel/pnpm-lock.yaml /opt/aerion-panel/node_modules /opt/aerion-panel/client /opt/aerion-panel/server /opt/aerion-panel/shared /opt/aerion-panel/drizzle /opt/aerion-panel/drizzle.config.ts
sudo tar -xzf "$PANEL_ARCHIVE" -C /opt/aerion-panel
cd /opt/aerion-panel
if ! command -v pnpm >/dev/null 2>&1 || ! pnpm --version >/dev/null 2>&1; then
  sudo npm install --global --force "pnpm@${PNPM_VERSION}"
fi
sudo -u "$AERION_USER" pnpm install --frozen-lockfile
sudo -u "$AERION_USER" install -d /opt/aerion-panel/data/storage
sudo chown -R "$AERION_USER":"$AERION_USER" /opt/aerion-panel

sudo install -d -m 0750 -o "$AERION_USER" -g "$AERION_USER" /etc/aerion
sudo tee /etc/aerion/panel.env >/dev/null <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://aerion:${DB_PASSWORD}@127.0.0.1:3306/aerion
JWT_SECRET=${JWT_SECRET}
STORAGE_DIR=/opt/aerion-panel/data/storage
AERION_NODE_AGENT_URL=${NODE_AGENT_URL}
AERION_NODE_AGENT_TOKEN=${NODE_TOKEN}
ENV
sudo chmod 600 /etc/aerion/panel.env

cd /opt/aerion-panel
set -a
# shellcheck disable=SC1091
source /etc/aerion/panel.env
set +a
if mysql --protocol=TCP -h 127.0.0.1 -u aerion -p"$DB_PASSWORD" aerion \
    -e "SELECT 1 FROM users LIMIT 1;" >/dev/null 2>&1; then
  echo "Aerion database schema already exists; skipping migration generation."
else
  sudo -u "$AERION_USER" env NODE_ENV=production DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" STORAGE_DIR="$STORAGE_DIR" AERION_NODE_AGENT_URL="$AERION_NODE_AGENT_URL" AERION_NODE_AGENT_TOKEN="$AERION_NODE_AGENT_TOKEN" pnpm run db:push
fi
sudo -u "$AERION_USER" pnpm run build

sudo tee /etc/systemd/system/aerion-panel.service >/dev/null <<'UNIT'
[Unit]
Description=Aerion Self-Hosted Panel
After=network-online.target mariadb.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/aerion-panel
EnvironmentFile=/etc/aerion/panel.env
ExecStart=/usr/bin/node /opt/aerion-panel/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
# Keep the service account aligned when installing as a non-ubuntu user.
sudo sed -i "s/^User=ubuntu$/User=${AERION_USER}/" /etc/systemd/system/aerion-panel.service

sudo tee /etc/nginx/sites-available/aerion-panel >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
NGINX
sudo sed -i "s/__DOMAIN__/${DOMAIN}/g" /etc/nginx/sites-available/aerion-panel
sudo ln -sf /etc/nginx/sites-available/aerion-panel /etc/nginx/sites-enabled/aerion-panel
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now aerion-panel
sudo systemctl reload nginx
sudo certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$DOMAIN"
sudo systemctl reload nginx
sleep 2
curl -fsS "https://${DOMAIN}/" >/dev/null && printf 'panel_installed\n' || printf 'panel_started_but_https_check_failed\n'
