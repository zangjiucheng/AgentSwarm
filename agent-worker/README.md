# AgentSwarm Worker Image

`agent-worker:latest`

## Base

- `kasmweb/ubuntu-jammy-dind:1.18.0` - upstream desktop + DinD base image used directly by this repo

- `agent-worker:latest` - Built on top of `:base` with Codex and additional automation. Includes:
  - Kasm VNC Server (custom fork to work in iframe)
  - Ubuntu 22.04 LTS with a minimal i3 desktop session, fixed 1080p resolution
  - Node.js 22.x LTS
  - Screen record skill
  - Computer use MCP
  - Chrome DevTools MCP
  - Pre-installed Codex CLI
  - Docker in Docker
  - Lightweight [`monitor`](../apps/monitor) daemon

## Summary

This image (`agent-worker:latest`) is intended to be used as a **starting point**. End users should build their own images on top of this to add their development tools, project dependencies, and custom configurations.

This image uses the Kasm Ubuntu base directly. It no longer depends on `claude-worker:base`. It does not run NixOS inside the container. The performance-oriented change in this repo is switching the active desktop session from XFCE to i3, which removes a significant amount of desktop overhead without rewriting the full Kasm/VNC stack.

The worker build is mac-compatible in the sense that you can build it from macOS with Docker Desktop. On Apple Silicon, the build script defaults to `linux/amd64`. The Dockerfile downloads the official upstream `kasmtech/KasmVNC` Ubuntu Jammy package for the selected architecture.

Current `linux/arm64` gaps:

- the upstream base image used here has not been validated in this repo for an `arm64` desktop flow
- the full stack still needs runtime validation on `arm64`: KasmVNC, i3, nginx, DinD, and the monitor daemon

Build examples:

```bash
# local single-arch build on Apple Silicon
./build.sh
```

Only local single-platform builds are supported. If you override `DOCKER_PLATFORMS`, it must be a single platform.

## Container Initialization

When the container starts, the [`monitor`](../apps/monitor) process initializes the workspace in this order:

1. It creates two tmux sessions: `codex` and `terminal`.
2. It runs `source ~/setup.sh` inside the `codex` tmux session.
3. It reads `codex` tmux session's current working directory and changes the `terminal` tmux session into the same directory.
4. If `OPENAI_API_KEY` is present, it signs Codex in non-interactively.
5. It starts Codex in the `codex` session, appending `CODEX_PROMPT` when provided.

For end-user customization, the most important hook is `~/setup.sh`. Build your own image on top of this one and replace that file to install dependencies, export environment variables, clone repositories, or prepare the workspace before Codex starts.

## Environment Variables

| Variable              | Description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`      | API key for authenticating Codex in headless/programmatic workflows                                               |
| `GITHUB_TOKEN`        | GitHub personal access token for repository operations                                                            |
| `CODEX_PROMPT`        | Initial prompt to send to Codex on startup                                                                        |
| `CODEX_ONESHOT`       | If set, Codex runs in non-interactive mode, reports the final answer to the orchestrator, and then self-destructs |
| `START_DE`            | Desktop session to launch. Defaults to `i3`. Set to `xfce4-session`, `openbox`, or `kde5` only if needed.       |

Only `CODEX_PROMPT` and `CODEX_ONESHOT` are supported.

## Ports

- `monitor` runs on port `51301` inside the container.
- Kasm VNC Server runs on port `6901` inside the container.
- A nginx server runs on port `51300` inside the container.
  - reverse proxies `/monitor` to internal port `51301`
  - reverse proxies everything else to internal port `6901`

You only need to expose the port `51300` to the outside world.

## Run Standalone

This container is supposed to be started by [`backend`](../apps/backend). However, you can run it standalone for development purposes.

```bash
docker run --rm -d \
  --shm-size=512m \
  -p 51300:51300 \
  --privileged \
  -e OPENAI_API_KEY=sk-xxx \
  # more environment variables...
  agent-worker:latest
```

Note: `--privileged` is required for Docker in Docker.

After the container is running, you can access the desktop at `http://localhost:51300/`.

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).

This worker image is built on top of the Kasm Workspaces / KasmVNC stack, especially the `kasmweb/ubuntu-jammy-dind` base image. Credit to the original project for the desktop streaming foundation this repo builds on.
