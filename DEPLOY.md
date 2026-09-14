# Deploying Aerion to your own VPS

The supported path is the one-command installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mysxmass-alt/aerion-control-plane/main/install.sh)
```

Run it on a fresh Ubuntu 22.04 or 24.04 VPS as a sudo-capable user. Before starting, create a DNS **A record** such as `panel.example.com -> YOUR_VPS_IP` and ensure ports 22, 80, and 443 are reachable from the internet. The installer generates the database password, JWT secret, node-agent token, and deploy archive automatically.

## What the installer does

The installer clones the repository into `/tmp/aerion-src`, installs Docker, UFW, fail2ban, and the runtime tools, then installs the node agent as `aerion-node-agent.service`. It installs Node.js 22 and pnpm, builds the frontend and backend, provisions MariaDB, applies the Drizzle schema, installs the panel under `/opt/aerion-panel`, and configures `aerion-panel.service` behind nginx. Finally, it requests a Let's Encrypt certificate for the domain.

The installer does not require manually downloading or unpacking a project archive. It obtains the source directly from GitHub.

## Configuration

For an interactive installation, the script asks for the panel domain and whether the node agent runs on the same VPS. To run it non-interactively on one VPS:

```bash
AERION_DOMAIN=panel.example.com AERION_SAME_BOX=yes \
  bash <(curl -fsSL https://raw.githubusercontent.com/mysxmass-alt/aerion-control-plane/main/install.sh)
```

For a panel and node agent on separate VPSs, install the node agent on the second VPS first, then provide the remote URL and token to the panel installer:

```bash
AERION_DOMAIN=panel.example.com \
AERION_SAME_BOX=no \
AERION_NODE_AGENT_URL=https://node.example.com \
AERION_NODE_AGENT_TOKEN='replace-with-the-agent-token' \
  bash <(curl -fsSL https://raw.githubusercontent.com/mysxmass-alt/aerion-control-plane/main/install.sh)
```

The node agent token is stored on the node VPS at `/opt/aerion-node/agent.token`. Treat it as a password and use HTTPS whenever the node agent is reached over the public internet.

## First login

When the installer finishes, open `https://panel.example.com/login` and create the first account. The first account is promoted to administrator automatically, so create it before sharing the URL.

## Day-to-day operations

```bash
sudo systemctl status aerion-panel aerion-node-agent
sudo journalctl -u aerion-panel -f
sudo journalctl -u aerion-node-agent -f
sudo systemctl restart aerion-panel
sudo systemctl restart aerion-node-agent
```

The panel environment is stored in `/etc/aerion/panel.env`. Uploaded files are stored in `/opt/aerion-panel/data/storage`. Re-running the installer is supported for upgrades, but it rebuilds the panel and reapplies the database migrations.

## Troubleshooting

If nginx validation fails, inspect `/etc/nginx/sites-enabled/` for another site using the same hostname. If certificate issuance fails, verify that DNS has propagated and that port 80 is reachable from the VPS provider firewall. If the panel reports that the node is unreachable, compare `AERION_NODE_AGENT_URL` and `AERION_NODE_AGENT_TOKEN` in `/etc/aerion/panel.env` with the node agent's configuration. If the first account is not an administrator, check the database connection and server logs before creating additional accounts.
