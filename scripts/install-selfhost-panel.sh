#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
source /tmp/aerion-deploy-config.txt
NODE_TOKEN=$(cat /tmp/aerion-node-token)

sudo apt-get update
sudo apt-get install -y mariadb-server nginx certbot python3-certbot-nginx
sudo systemctl enable --now mariadb
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS aerion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'aerion'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER 'aerion'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON aerion.* TO 'aerion'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
sudo mysql aerion <<'SQL'
CREATE TABLE IF NOT EXISTS users (id int AUTO_INCREMENT NOT NULL, openId varchar(64) NOT NULL, name text, email varchar(320), loginMethod varchar(64), role enum('user','admin') NOT NULL DEFAULT 'user', createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, lastSignedIn timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY users_openId_unique (openId));
CREATE TABLE IF NOT EXISTS stored_files (id int AUTO_INCREMENT NOT NULL, userId int NOT NULL, serverName varchar(100) NOT NULL, originalName varchar(255) NOT NULL, storageKey varchar(512) NOT NULL, storageUrl varchar(768) NOT NULL, mimeType varchar(150) NOT NULL, size int NOT NULL, createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY stored_files_storageKey_unique (storageKey));
SQL

sudo install -d -o ubuntu -g ubuntu /opt/aerion-panel
sudo rm -rf /opt/aerion-panel/dist /opt/aerion-panel/package.json /opt/aerion-panel/node_modules
sudo tar -xzf /tmp/aerion-panel.tar.gz -C /opt/aerion-panel
cd /opt/aerion-panel
sudo npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund
sudo chown -R ubuntu:ubuntu /opt/aerion-panel
sudo install -d -m 0750 /etc/aerion
sudo tee /etc/aerion/panel.env >/dev/null <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://aerion:${DB_PASSWORD}@127.0.0.1:3306/aerion
JWT_SECRET=${JWT_SECRET}
VITE_APP_ID=${VITE_APP_ID}
OAUTH_SERVER_URL=${OAUTH_SERVER_URL}
VITE_OAUTH_PORTAL_URL=${VITE_OAUTH_PORTAL_URL}
OWNER_NAME=Mystic Head
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
AERION_NODE_AGENT_URL=https://node.mystichost.qzz.io
AERION_NODE_AGENT_TOKEN=${NODE_TOKEN}
ENV
sudo chmod 600 /etc/aerion/panel.env
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
sudo tee /etc/nginx/sites-available/aerion-panel >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name tech.mystichost.qzz.io;
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
sudo ln -sf /etc/nginx/sites-available/aerion-panel /etc/nginx/sites-enabled/aerion-panel
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now aerion-panel
sudo systemctl reload nginx
sudo certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d tech.mystichost.qzz.io
sudo systemctl reload nginx
curl -fsS https://tech.mystichost.qzz.io/ | grep -q 'Aerion' || true
printf 'panel_installed\n'
