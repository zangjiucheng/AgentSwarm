# Claude Worker Docker Image

`pegasis0/claude-worker:latest`

## Image Hierarchy

- `pegasis0/claude-worker:base` - Created manually from `kasmweb/ubuntu-jammy-dind:1.18.0` with the following customizations:
  1. In settings, change taskbar to bottom, reduce workspace count to 1, and remove workspace switcher from task bar
  2. Install papirus icon theme from https://github.com/PapirusDevelopmentTeam/papirus-icon-theme
  3. Download zorin blue light theme from https://github.com/ZorinOS/zorin-desktop-themes/releases/tag/5.2.2 and install to /usr/share/themes/
  4. Set terminal theme to white
  5. Run "ln -s /home/kasm-user/ Home" under ~/Desktop
  6. Reorganize desktop
  7. Change desktop background

- `pegasis0/claude-worker:latest` - Built on top of `:base` with Claude Code and additional automation. Includes:
  - Kasm VNC Server (custom fork to work in iframe)
  - Ubuntu 22.04 LTS with XFCE Desktop Environment, fixed 1080p resolution
  - Node.js 22.x LTS
  - Screen record skill
  - Discord notify skill
  - Computer use MCP
  - Chrome DevTools MCP
  - Pre-installed Claude Code
  - Docker in Docker
  - Lightweight [`monitor`](../apps/monitor) daemon

## Usage

This image (`pegasis0/claude-worker:latest`) is intended to be used as a **starting point**. End users should build their own images on top of this to add their development tools, project dependencies, and custom configurations.

## Container Initialization

When the container starts, the [`monitor`](../apps/monitor) process initializes the workspace in this order:

1. It creates two tmux sessions: `claude` and `terminal`.
2. It runs `source ~/setup.sh` inside the `claude` tmux session.
3. It reads `claude` tmux session's current working directory and changes the `terminal` tmux session into the same directory.
4. It starts Claude Code in the `claude` session, appending `CLAUDE_PROMPT` when provided.

For end-user customization, the most important hook is `~/setup.sh`. Build your own image on top of this one and replace that file to install dependencies, export environment variables, clone repositories, or prepare the workspace before Claude starts.

## Environment Variables

| Variable                  | Description                                                                    |
| ------------------------- | ------------------------------------------------------------------------------ |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for authenticating with Claude Code, get from `claude setup-token` |
| `GITHUB_TOKEN`            | GitHub personal access token for repository operations                         |
| `CLAUDE_PROMPT`           | Initial prompt to send to Claude Code on startup                               |
| `DISCORD_USER_ID`         | Discord user ID to notify on build completion                                  |
| `DISCORD_WEBHOOK_URL`     | Discord webhook URL to send notifications to                                   |

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
  -e CLAUDE_CODE_OAUTH_TOKEN=sk-ant-xxx \
  # more environment variables...
  pegasis0/claude-worker:latest
```

Note: `--privileged` is required for Docker in Docker.

After the container is running, you can access the desktop at `http://localhost:51300/monitor`.
