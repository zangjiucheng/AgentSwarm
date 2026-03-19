# AgentSwarm

[![Docker](https://github.com/zangjiucheng/AgentSwarm/actions/workflows/docker.yml/badge.svg)](https://github.com/zangjiucheng/AgentSwarm/actions/workflows/docker.yml)
[![Nix Worker](https://img.shields.io/badge/Nix-worker-5277C3?logo=nixos&logoColor=white)](./agent-worker/flake.nix)

## Run

### Remote Images

```bash
./run.sh --remote-images
```

Recommended for normal use. This pulls `ghcr.io/zangjiucheng/agentswarm:latest` for the app and rewrites the mounted config so new workers use `ghcr.io/zangjiucheng/agentswarm-worker:latest`.

Pin a specific published image:

```bash
IMAGE_TAG=ghcr.io/zangjiucheng/agentswarm:sha-<commit> \
WORKER_IMAGE_TAG=ghcr.io/zangjiucheng/agentswarm-worker:sha-<commit> \
./run.sh --remote-images
```

GitHub Actions builds both images only when new commits land on `main`. In-progress older runs are canceled automatically when a newer commit is pushed to `main`. Successful runs publish multi-arch images to `ghcr.io/zangjiucheng/agentswarm` and `ghcr.io/zangjiucheng/agentswarm-worker`.

### Local Build

For local development:

```bash
./run.sh
```

If you only want to build:

```bash
./build.sh
```

To rebuild workers from scratch:

```bash
./run.sh --cleanup-workers
```

Build scripts now prune Docker build cache before each build to keep local disk usage under control.

On Apple Silicon macOS, the build defaults to `linux/arm64`. If needed, override `DOCKER_PLATFORMS` with a single platform such as `linux/amd64` or `linux/arm64`.

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

### Notes

The runtime image already includes a default config, so mounting [`/apps/backend/config.json`](./apps/backend/config.json) is optional unless you want to override it.
The backend secret store is persisted under `/app/data`, so keep that path on a Docker volume if you want GitHub accounts and other stored settings to survive container rebuilds.

When you create a worker from the UI, the worker image comes from the active config. `./run.sh --remote-images` points presets to `ghcr.io/zangjiucheng/agentswarm-worker:latest`, while local builds use `agent-worker:latest`. The required env vars are:

- none by default

`OPENAI_API_KEY` is optional. It is available inside the worker so you can use Codex from the integrated terminal in `code-server`.

`GITHUB_TOKEN` is also optional. GitHub-specific operations such as PR inspection or authenticated remote access will only work when a token is available.

You can configure `GITHUB_USERNAME` and `GITHUB_TOKEN` from the dashboard's global settings. They are stored in AgentSwarm's own persistent data volume, not in [`apps/backend/config.json`](./apps/backend/config.json), and are injected into newly created workers automatically.

Each worker now exposes a single `code-server` web IDE on its published port. The dashboard embeds that IDE directly instead of showing a desktop/VNC session or custom terminal panes.

Workers are persistent Docker containers until you explicitly destroy them. From the dashboard you can pause a worker without deleting its workspace and start it again later from the same UI.

Each newly created worker now gets its own Docker volume mounted at `/home/kasm-user/workers`, so its workspace survives stop/start cycles and can be migrated to a fresh container later.

The dashboard also includes a `Migrate` action. It recreates the worker from the latest image while reusing the same persisted workspace volume. Older workers created before workspace volumes were introduced cannot be migrated automatically.

When creating a worker from the dashboard, you can optionally provide a repository URL. The worker will clone that repository on first boot and open `code-server` directly in the cloned directory.

For GitHub repositories, a configured `GITHUB_TOKEN` is also used for the initial clone. This means private GitHub repos can be cloned at worker startup without requiring an SSH key inside the worker.

The worker image is Nix-based and declares its toolchain in [`agent-worker/flake.nix`](./agent-worker/flake.nix). The pinned package set lives in [`agent-worker/flake.lock`](./agent-worker/flake.lock).

Preset suggestions included in the default config:

- `frontend`: frontend-focused default with `NODE_ENV=development` and `BROWSER=none`
- `fullstack`: general app development preset with `NODE_ENV=development`
- `oss-contrib`: tuned for GitHub-driven contribution flows and gh CLI usage
- `ai-agent`: agent-oriented preset that requires `OPENAI_API_KEY`

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).
