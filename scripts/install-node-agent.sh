#!/usr/bin/env bash
set -euo pipefail

AERION_USER="${AERION_USER:-${SUDO_USER:-ubuntu}}"
TOKEN="$(cat /tmp/aerion-node-token)"
sudo install -d -o "$AERION_USER" -g "$AERION_USER" /opt/aerion-node/bin /opt/aerion-node/data
sudo install -o "$AERION_USER" -g "$AERION_USER" -m 0755 /tmp/aerion-node-agent.js /opt/aerion-node/bin/agent.js
printf '%s\n' "$TOKEN" | sudo tee /opt/aerion-node/agent.token >/dev/null
sudo chmod 600 /opt/aerion-node/agent.token
sudo tee /etc/systemd/system/aerion-node-agent.service >/dev/null <<'UNIT'
[Unit]
Description=Aerion Docker Node Agent
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/aerion-node
Environment=AERION_AGENT_PORT=8787
Environment=AERION_AGENT_TOKEN_FILE=/opt/aerion-node/agent.token
Environment=AERION_DATA_ROOT=/opt/aerion-node/data
ExecStart=/usr/bin/node /opt/aerion-node/bin/agent.js
Restart=always
RestartSec=3
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now aerion-node-agent
sudo systemctl --no-pager --full status aerion-node-agent | head -25
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8787/health; then
    printf '\n'
    exit 0
  fi
  sleep 1
done
echo "Node agent did not become healthy within 20 seconds." >&2
sudo journalctl -u aerion-node-agent -n 40 --no-pager >&2 || true
exit 1
