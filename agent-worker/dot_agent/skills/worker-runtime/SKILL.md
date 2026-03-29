---
name: worker-runtime
description: Use when changing worker images, startup scripts, workspace defaults, code-server settings or extensions, shell defaults, repo cloning on startup, or other containerized worker behavior.
---

# Worker Runtime Skill

Use this skill when the requested change belongs to the worker image or startup contract rather than the application itself.

## Preferred Defaults

- Put durable defaults in the worker image or entrypoint, not in one-off manual steps.
- Keep `WORKSPACE_DIR` as the single source of truth for workspace location.
- Preinstall editor defaults such as extensions and settings at image build time when possible.
- Treat optional setup, such as repo cloning or auth bootstrap, as non-fatal unless the user explicitly wants hard failure.

## Workflow

1. Identify where the behavior actually lives:
   - `Dockerfile`
   - entrypoint script
   - shell rc files
   - helper scripts under `agent-worker/`
2. Check whether the behavior should happen:
   - at build time
   - at container startup
   - on first interactive shell
3. Prefer one canonical implementation path. Avoid duplicating the same rule in multiple scripts unless it is required.
4. If the change affects new workers only, say so clearly.
5. For computer-use workers, treat worker-local MCP servers and their Codex config as part of the runtime contract, not ad hoc user setup.

## Validation Targets

- workspace path
- persisted volume behavior
- container health startup path
- code-server availability
- shell and tmux defaults
- helper script presence and permissions
- MCP config presence and correct computer-use gating
