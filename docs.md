# AgentSwarm Docs

## What You Get

### Dashboard

- Create, start, pause, migrate, and destroy workers from the web UI.
- Persist GitHub accounts and other backend-managed settings under `/app/data`.
- Configure automatic worker pause after a chosen runtime threshold.

### Worker Runtime

- One `code-server` IDE per worker.
- Optional desktop exposed over browser VNC for computer-use workflows, while the main workspace remains in `code-server`.
- Persistent workspace storage mounted at `/home/kasm-user/workers`.
- Optional repository clone on first boot.
- Optional GitHub account injection for HTTPS clone, `gh`, and git operations.
- SSH access for VS Code Remote-SSH on a worker-specific published port.

### Worker Lifecycle

- Workers are persistent Docker containers until explicitly destroyed.
- Paused workers keep their workspace and can be restarted later.
- `Migrate` recreates a worker from the latest image while reusing the same workspace volume.
- Older workers created before workspace volumes were introduced cannot be migrated automatically.

## Worker Access

### In Browser

The dashboard embeds each worker's `code-server` instance directly.

Computer-use workers keep `code-server` in the main pane and expose desktop access through `Open desktop` once provisioning finishes.

### VS Code Remote-SSH

Each new worker publishes an SSH endpoint. In the worker view, AgentSwarm shows:

- the `ssh kasm-user@<host> -p <port>` command
- the worker password
- the workspace path

Use that SSH target with the VS Code Remote-SSH extension.

Older workers created before SSH exposure was added need to be migrated or recreated before this works.

## Settings and Secrets

### Global Settings

The dashboard stores settings in AgentSwarm's own persistent backend volume, not in `apps/backend/config.json`.

Current dashboard-managed settings include:

- saved GitHub accounts
- default GitHub account selection
- worker auto-pause timeout

### Environment Variables

Required by default:

- none

Optional:

- `OPENAI_API_KEY`: available inside workers for Codex and other OpenAI tooling
- `GITHUB_TOKEN`: enables authenticated GitHub operations when provided directly

GitHub accounts configured from the dashboard are injected into newly created workers automatically.

## Repository Clone Behavior

When creating a worker, you can optionally provide a repository URL. AgentSwarm will:

1. create or reuse the persistent workspace volume
2. clone the repository on first boot
3. open `code-server` in the cloned directory

For GitHub repositories, a configured GitHub account can also be used for the initial clone, including private repositories over HTTPS.

## Presets

The default config includes these preset suggestions:

- `frontend`: frontend-focused default with `NODE_ENV=development` and `BROWSER=none`
- `fullstack`: general app development preset with `NODE_ENV=development`
- `oss-contrib`: tuned for GitHub-driven contribution flows and `gh` CLI usage
- `ai-agent`: agent-oriented preset that typically uses `OPENAI_API_KEY`

When using `./run.sh --remote-images`, presets are rewritten to point to `ghcr.io/zangjiucheng/agentswarm-worker:latest` unless you pin a different worker image explicitly.

## Worker Image

The worker image is Debian-based:

- runtime image definition: [`agent-worker/Dockerfile`](./agent-worker/Dockerfile)
- worker entrypoint: [`agent-worker/docker-entrypoint.sh`](./agent-worker/docker-entrypoint.sh)

### Extra Computer-Use Setup Script

Computer-use mode ships with a default desktop/browser/tooling stack in the worker image. You can optionally run an extra setup script during startup to add project-specific tools or configuration.

If you do not want to maintain your own setup script yet, use the sample in this repo:

- example value: `./examples/computer-use-extra/setup.sh`
- sample files: [`examples/computer-use-extra/setup.sh`](./examples/computer-use-extra/setup.sh) and [`examples/computer-use-extra/README.md`](./examples/computer-use-extra/README.md)

## Notes

- The backend secret store lives under `/app/data`, so keep that path on a Docker volume if you want settings to survive rebuilds.
- New workers get their own workspace volume, which is why pause/start and migrate preserve working files.
- `run.sh` supports `PYTHON_BIN=/path/to/python3` if your local `python3` command is broken and remote-image config rewriting needs a working Python 3 interpreter.
