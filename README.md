# AgentSwarm

## Run

Build the images:

```bash
./build.sh
```

Or build and start everything in one step:

```bash
./run.sh
```

By default, `./run.sh` preserves existing worker containers. If you explicitly want to remove existing workers before rebuilding the worker image, use:

```bash
./run.sh --cleanup-workers
```

Build scripts now prune Docker build cache before each build to keep local disk usage under control.

On Apple Silicon macOS, the build defaults to `linux/arm64`. If needed, override `DOCKER_PLATFORMS` with a single platform such as `linux/amd64` or `linux/arm64`.

Start the app:

```bash
docker run -d \
  --name agentswarm \
  -e PORT=14000 \
  -p 14000:14000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/apps/backend/config.json:/app/config.json" \
  agent-swarm:latest
```

Then open `http://localhost:14000`.

The runtime image already includes a default config, so mounting [`/apps/backend/config.json`](./apps/backend/config.json) is optional unless you want to override it.

When you create a worker from the UI, the default image tag is `agent-worker:latest`. The required env vars are:

- none by default

`OPENAI_API_KEY` is optional. It is available inside the worker so you can use Codex from the integrated terminal in `code-server`.

`GITHUB_TOKEN` is also optional. GitHub-specific operations such as PR inspection or authenticated remote access will only work when a token is available.

You can now configure `GITHUB_USERNAME` and `GITHUB_TOKEN` once from the dashboard's global settings. They are persisted in the backend config and injected into newly created workers automatically.

Each worker now exposes a single `code-server` web IDE on its published port. The dashboard embeds that IDE directly instead of showing a desktop/VNC session or custom terminal panes.

Workers are persistent Docker containers until you explicitly destroy them. From the dashboard you can pause a worker without deleting its workspace and start it again later from the same UI.

When creating a worker from the dashboard, you can optionally provide a repository URL. The worker will clone that repository on first boot and open `code-server` directly in the cloned directory.

For GitHub repositories, a configured `GITHUB_TOKEN` is also used for the initial clone. This means private GitHub repos can be cloned at worker startup without requiring an SSH key inside the worker.

The worker image is Nix-based and declares its toolchain in [`agent-worker/flake.nix`](/Users/jiucheng/Dev/AgentSwarm/agent-worker/flake.nix). The pinned package set lives in [`agent-worker/flake.lock`](/Users/jiucheng/Dev/AgentSwarm/agent-worker/flake.lock).

Preset suggestions included in the default config:

- `frontend`: frontend-focused default with `NODE_ENV=development` and `BROWSER=none`
- `fullstack`: general app development preset with `NODE_ENV=development`
- `oss-contrib`: tuned for GitHub-driven contribution flows and gh CLI usage
- `ai-agent`: agent-oriented preset that requires `OPENAI_API_KEY`

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).
