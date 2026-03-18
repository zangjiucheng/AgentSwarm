# AgentSwarm

Browser UI for launching and managing Codex-powered worker containers.

## Layout

```text
apps/
  backend/       # Docker orchestration API
  frontend/      # web UI
  monitor/       # daemon that runs inside each worker
agent-worker/    # worker image and desktop environment
```

The worker image boots into Codex and defaults to an i3 desktop session. Worker-specific details live in [`/agent-worker/README.md`](./agent-worker/README.md).

## Development

Run:

```bash
bun install
bun run dev
```

To remove generated build output and installed dependencies:

```bash
bun run clean
```

To do a full end-of-session cleanup, including AgentSwarm Docker containers and images:

```bash
bun run wrapup
```

Then open `http://localhost:3000`.

This starts:

- backend on `http://127.0.0.1:3000`
- Vite dev server on `http://127.0.0.1:4100`

## Build

Run:

```bash
./build.sh
```

The worker image defaults to the official upstream `kasmtech/KasmVNC` Ubuntu Jammy package. On Apple Silicon macOS, the Docker build still defaults to `linux/amd64` unless you override `DOCKER_PLATFORMS`.

This builds:

- the `monitor` binary
- the worker image `agent-worker:latest`
- the app image `agent-swarm:latest`

Only local single-platform Docker builds are supported. If you set `DOCKER_PLATFORMS`, it must be a single platform such as `linux/amd64` or `linux/arm64`.

## Run

1. Copy the example config:

```bash
cp apps/backend/config.json config.json
```

2. Start the app:

```bash
docker run -d \
  -e PORT=14000 \
  -p 14000:14000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/config.json:/app/config.json" \
  agent-swarm:latest
```

3. Open `http://localhost:14000`.

## Config

The example file is [`/apps/backend/config.json`](./apps/backend/config.json).

Each preset defines:

- `imageTag`: worker image to launch
- `presetEnv`: env vars injected automatically
- `requiredEnv`: env vars the UI must ask for

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).

The worker desktop stack builds on Kasm Workspaces and KasmVNC via the `kasmweb/ubuntu-jammy-dind` base image and related tooling. AgentSwarm customizes that stack for Codex-driven workers rather than replacing it from scratch.
