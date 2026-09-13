#!/usr/bin/env bash
set -euo pipefail
sudo install -o ubuntu -g ubuntu -m 0755 /tmp/aerion-node-agent.js /opt/aerion-node/bin/agent.js
sudo systemctl restart aerion-node-agent
sleep 1
sudo systemctl --no-pager --full status aerion-node-agent | head -22
curl -fsS http://127.0.0.1:8787/health
printf '\n'
