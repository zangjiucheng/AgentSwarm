# ClaudeSwarm

## Structure

```text
apps/
  backend/       # backend server, manages life cycle of workers
  frontend/      # frontend app, connects to backend
  monitor/       # lightweight monitor daemon runs inside each worker
claude-worker/   # base worker image, end user should build their own image on top of this
```

## Development

`bun run dev` starts:

- the backend on `http://127.0.0.1:3000`
- the Vite dev server on `http://127.0.0.1:4100` (do not access this directly)

The backend forwards vite dev server during development. Access the frontend at `http://localhost:3000`.

## Production Build

`./build.sh [--push]`:

- builds `monitor`
- builds and pushes `pegasis0/claude-worker:latest` image with `monitor` daemon
- builds `frontend` and `backend`
- builds and pushes `pegasis0/claude-swarm:latest` image with `frontend` and `backend`

## Start Production Build

### Docker CLI

```bash
docker run -d -e PORT=14000 -p 14000:14000 -v /var/run/docker.sock:/var/run/docker.sock -v ./config.json:/app/config.json pegasis0/claude-swarm:latest
```

And navigate to `http://localhost:14000` to access the frontend.

### Docker Compose

```yaml
services:
  claudeswarm:
    image: pegasis0/claude-swarm:latest
    network_mode: bridge
    ports:
      - "14000:14000"
    restart: unless-stopped
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "./config.json:/app/config.json"
    environment:
      - PORT=14000
```

And navigate to `http://localhost:14000` to access the frontend.

## Configuration File

An example configuration file is provided in [`/apps/backend/config.json`](./apps/backend/config.json).

- `drinode` is the device node for hardware acceleration. (default: `/dev/dri/renderD128`)
- `presetEnv` is a dictionary of predefined environment variables.
- `requiredEnv` is an array of environment variables that must be set when starting a worker.

## Worker Image

See [`/claude-worker/README.md`](./claude-worker/README.md) for how to create custom worker images.