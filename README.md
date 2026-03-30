# AgentSwarm

[![Docker](https://github.com/zangjiucheng/AgentSwarm/actions/workflows/docker.yml/badge.svg)](https://github.com/zangjiucheng/AgentSwarm/actions/workflows/docker.yml)
[![Debian Worker](https://img.shields.io/badge/Debian-worker-A81D33?logo=debian&logoColor=white)](./agent-worker/Dockerfile)

AgentSwarm runs a Docker-hosted dashboard that creates persistent coding workers. Each worker exposes a `code-server` IDE, a terminal monitor, and an SSH endpoint that can be used with VS Code Remote-SSH.

## Quick Start

### Install

Recommended for normal use. This starts AgentSwarm with published remote images by default.

```bash
curl -fsSL https://raw.githubusercontent.com/zangjiucheng/AgentSwarm/refs/heads/main/run.sh | bash -s -- --remote-images
```

Open `http://localhost:14000` after startup.

Set `AGENTSWARM_ADMIN_TOKEN` on the backend and `VITE_AGENTSWARM_ADMIN_TOKEN` in the frontend build, or enter the admin token in the dashboard when prompted. After login, you can rotate the shared admin token from `Settings`.

### Uninstall

This removes the local AgentSwarm container, generated config, and related images handled by `wrapup.sh`.

```bash
curl -fsSL https://raw.githubusercontent.com/zangjiucheng/AgentSwarm/refs/heads/main/wrapup.sh | bash
```

## Run Modes

### Remote Images

Use published images from GitHub Container Registry:

```bash
./run.sh --remote-images
```

Pin a specific published image:

```bash
IMAGE_TAG=ghcr.io/zangjiucheng/agentswarm:sha-<commit> \
WORKER_IMAGE_TAG=ghcr.io/zangjiucheng/agentswarm-worker:sha-<commit> \
./run.sh --remote-images
```

When remote mode is enabled:

- The app image comes from `ghcr.io/zangjiucheng/agentswarm`.
- The worker image comes from `ghcr.io/zangjiucheng/agentswarm-worker`.
- `run.sh` rewrites the active config so newly created workers use the selected remote worker image.

GitHub Actions publishes multi-arch images for `main` and `latest` to both registries.

### Local Build

Use local Docker builds during development:

```bash
./run.sh
```

Build without starting the app:

```bash
./build.sh
```

Rebuild workers from scratch:

```bash
./run.sh --cleanup-workers
```

Build scripts prune Docker build cache before each build to limit local disk usage.

On Apple Silicon macOS, local builds default to `linux/arm64`. Override `DOCKER_PLATFORMS` with a single platform such as `linux/amd64` or `linux/arm64` if needed.

### Manual Docker

Run the published app image directly:

```bash
docker run -d \
  --name agentswarm \
  -e PORT=14000 \
  -p 14000:14000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v agentswarm-data:/app/data \
  -v "$(pwd)/apps/backend/config.json:/app/config.json" \
  ghcr.io/zangjiucheng/agentswarm:latest
```

Then open `http://localhost:14000`.

The runtime image already includes a default config, so mounting `apps/backend/config.json` is optional unless you want to override it.

## Highlights

- Docker-hosted dashboard for creating and managing persistent workers
- Browser-based `code-server` IDE for each worker
- Optional desktop mode with browser VNC access for computer-use flows, while the main workspace stays on `code-server`
- Worker SSH access for VS Code Remote-SSH
- Persistent workspace volumes with pause/start and migrate support
- Dashboard-managed GitHub accounts and worker auto-pause settings
- Dashboard API protected by a shared admin token; worker callbacks stay worker-authenticated
- Worker containers run without Docker privileged mode by default

## Documentation

Detailed usage and runtime documentation lives in [docs.md](./docs.md), including:

- worker access in browser and VS Code Remote-SSH
- settings, secrets, and environment variables
- repository clone behavior
- presets and worker image details
- computer-use skill guidance for desktop workflows
- operational notes and persistence behavior

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).
