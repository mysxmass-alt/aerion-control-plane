# Aerion control plane

Aerion is a self-hosted Docker server panel with a server console, live stats, file manager, and administrator dashboard for managing multiple containerized servers on one VPS.

## One-command install

Point a DNS **A record** at a fresh Ubuntu 22.04 or 24.04 VPS, SSH in as a sudo-capable user, and run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mysxmass-alt/aerion-control-plane/main/install.sh)
```

The installer clones this repository, installs Docker and its supporting services, creates a local Docker node agent, installs Node.js 22 and pnpm, builds the panel, provisions MariaDB, configures nginx, and requests a Let's Encrypt certificate. It asks only for the panel domain and whether the node agent should run on the same VPS.

For a non-interactive run, set the domain and answer the same-box question through environment variables:

```bash
AERION_DOMAIN=panel.example.com AERION_SAME_BOX=yes \
  bash <(curl -fsSL https://raw.githubusercontent.com/mysxmass-alt/aerion-control-plane/main/install.sh)
```

The first account created at `https://panel.example.com/login` becomes the administrator. Create it before sharing the panel URL.

## Requirements

The installer expects a fresh Ubuntu 22.04/24.04 VPS with a public IPv4 address, SSH access, and DNS already pointing the chosen hostname to the VPS. Ports 22, 80, and 443 must be reachable. The installation user must have passwordless or interactive `sudo` access.

## Local development

```bash
sudo npm install --global pnpm@10.4.1
pnpm install --frozen-lockfile
cp .env.example .env
# Set DATABASE_URL and JWT_SECRET in .env.
pnpm run dev
```

Useful checks are:

```bash
pnpm run check
pnpm test
pnpm run build
```

## Operations

```bash
sudo systemctl status aerion-panel aerion-node-agent
sudo journalctl -u aerion-panel -f
sudo journalctl -u aerion-node-agent -f
sudo systemctl restart aerion-panel
sudo systemctl restart aerion-node-agent
```

See [`DEPLOY.md`](./DEPLOY.md) for the manual deployment flow, remote-node setup, and troubleshooting.

## Project layout

- `client/` — React frontend and panel UI.
- `server/` — Express and tRPC backend.
- `node-agent/` — dependency-light service that controls Docker workloads.
- `drizzle/` — database schema and migrations.
- `scripts/` — deployment scripts called by `install.sh` or run individually.
