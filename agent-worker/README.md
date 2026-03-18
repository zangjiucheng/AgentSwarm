# AgentSwarm Worker Image

`agent-worker:latest`

## Summary

This image is a lightweight worker runtime that exposes a single `code-server` instance on port `51300`. It keeps the existing `kasm-user` home directory and workspace path (`/home/kasm-user/workers`) for compatibility, but it no longer includes any desktop/VNC/Kasm stack.

The image is now built from a Nix-based base image and the worker toolchain is declared in [`flake.nix`](/Users/jiucheng/Dev/AgentSwarm/agent-worker/flake.nix). The pinned package set is checked in via [`flake.lock`](/Users/jiucheng/Dev/AgentSwarm/agent-worker/flake.lock).

Included by default:

- Nix-based worker image
- Node.js 22.x
- `code-server`
- OpenAI Codex CLI
- Docker in Docker
- Git, GitHub CLI, tmux, ripgrep, Python 3

This image is intended to be a starting point. Build your own image on top of it if you need additional SDKs, project dependencies, or workspace bootstrap logic.

## Startup Behavior

When the container starts it:

1. Starts `dockerd`
2. Ensures `/home/kasm-user/workers` exists
3. Starts `code-server` bound to `0.0.0.0:51300`

The dashboard embeds that `code-server` instance directly.

New workers default to the `Default Dark Modern` theme in `code-server`.

`~/setup.sh` is still included as the main customization hook for derived images, but it is no longer auto-run on startup.

## Environment Variables

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | Optional, available inside the worker so Codex can be used from the integrated terminal |
| `GITHUB_TOKEN` | Optional token for GitHub operations |
| `CODEX_PROMPT` | Optional passthrough env var; no longer consumed by startup |
| `CODEX_ONESHOT` | Optional passthrough env var; no longer consumed by startup |
| `STARTUP_REPO_URL` | Optional repository URL to clone before `code-server` starts |
| `WORKSPACE_DIR` | Optional override for the code-server workspace path |
| `CODE_SERVER_PORT` | Optional override for the code-server listen port |

## Ports

- `code-server` listens on port `51300` inside the container

Expose only port `51300`.

## Run Standalone

```bash
docker run --rm -d \
  --privileged \
  -p 51300:51300 \
  agent-worker:latest
```

After startup, open `http://localhost:51300/`.

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).
