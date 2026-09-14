#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

AERION_USER="${AERION_USER:-${SUDO_USER:-ubuntu}}"

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg ufw fail2ban jq unzip
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$AERION_USER"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo systemctl enable --now fail2ban
sudo mkdir -p /opt/aerion-node/{data,work,bin}
sudo chown -R "$AERION_USER":"$AERION_USER" /opt/aerion-node
printf 'docker='; docker --version
printf 'compose='; docker compose version
printf 'ufw='; sudo ufw status | tr '\n' ' '
printf '\n'
