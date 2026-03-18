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

- `CODEX_PROMPT`

`OPENAI_API_KEY` is optional. If the worker already has a valid Codex login session, it will use that first. The API key is only used as a fallback for non-interactive login.

`GITHUB_TOKEN` is also optional. GitHub-specific operations such as PR inspection or authenticated remote access will only work when a token is available.

## Credits

AgentSwarm is a fork of [PegasisForever/ClaudeSwarm](https://github.com/PegasisForever/ClaudeSwarm.git).
