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

You can now configure `GITHUB_TOKEN` once from the dashboard's global settings. It is persisted in the backend config and injected into newly created workers automatically.

Each worker now exposes a single `code-server` web IDE on its published port. The dashboard embeds that IDE directly instead of showing a desktop/VNC session or custom terminal panes.

When creating a worker from the dashboard, you can optionally provide a repository URL. The worker will clone that repository on first boot and open `code-server` directly in the cloned directory.

The worker image is Nix-based and declares its toolchain in [`agent-worker/flake.nix`](/Users/jiucheng/Dev/AgentSwarm/agent-worker/flake.nix). The pinned package set lives in [`agent-worker/flake.lock`](/Users/jiucheng/Dev/AgentSwarm/agent-worker/flake.lock).

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).
