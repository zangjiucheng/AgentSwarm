# AgentSwarm Worker Image

`agent-worker:latest`

## Summary

This image is a Debian-based worker runtime that exposes `code-server` on port `51300` and can optionally start a desktop/VNC stack for computer-use mode. It keeps the existing `kasm-user` home directory and workspace path (`/home/kasm-user/workers`) for compatibility.

The runtime image is defined in [`Dockerfile`](./Dockerfile), and startup behavior lives in [`docker-entrypoint.sh`](./docker-entrypoint.sh) and [`computer-use-start.sh`](./computer-use-start.sh).

Included by default:

- Debian-based worker image
- Node.js 22.x
- `code-server`
- VS Code Vim extension (`vscodevim.vim`)
- OpenAI Codex CLI
- `configure-github.sh` helper at `~/configure-github.sh` and `configure-github`
- Bundled Codex skills: `nix-flake`, `repo-survey`, `terminal-pty`, `worker-runtime`, `github-auth`, `frontend-regression`
- Docker in Docker
- Git, GitHub CLI, tmux, ripgrep, Python 3
- Optional XFCE/noVNC desktop stack for computer-use workers

This image is intended to be a starting point. Build your own image on top of it if you need additional SDKs, project dependencies, or workspace bootstrap logic.

## Startup Behavior

When the container starts it:

1. Starts `dockerd`
2. Ensures `/home/kasm-user/workers` exists
3. Optionally starts the computer-use desktop stack when enabled
4. Starts `code-server` bound to `0.0.0.0:51300`

The dashboard embeds that `code-server` instance directly.

New workers default to the `Default Dark Modern` theme in `code-server`.

`~/setup.sh` is still included as the main customization hook for derived images, but it is no longer auto-run on startup.

GitHub accounts are managed by the AgentSwarm backend secret store, not baked into the image. You can save multiple GitHub accounts, choose a default account for new workers, and assign a different account to an individual worker later. Those account records survive worker rebuilds and migrations.

## Environment Variables

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | Optional, available inside the worker so Codex can be used from the integrated terminal |
| `GITHUB_TOKEN` | Optional token for GitHub operations, typically injected by AgentSwarm from its secret store |
| `CODEX_PROMPT` | Optional passthrough env var; no longer consumed by startup |
| `CODEX_ONESHOT` | Optional passthrough env var; no longer consumed by startup |
| `STARTUP_REPO_URL` | Optional repository URL to clone before `code-server` starts |
| `WORKSPACE_DIR` | Optional override for the code-server workspace path |
| `CODE_SERVER_PORT` | Optional override for the code-server listen port |
| `WORKER_COMPUTER_USE_ENABLED` | Enable desktop/VNC startup for computer-use mode |
| `WORKER_COMPUTER_USE_EXTRA_SETUP_SCRIPT` | Optional extra setup script path or URL for computer-use startup |
| `WORKER_VNC_PASSWORD` | Optional VNC password override for computer-use mode |

## Ports

- `code-server` listens on port `51300` inside the container
- `sshd` listens on port `2222` when SSH is enabled
- noVNC listens on port `6901` when computer-use mode is enabled

Expose only the ports you need for your mode.

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
