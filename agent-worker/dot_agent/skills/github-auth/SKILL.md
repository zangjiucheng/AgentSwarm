---
name: github-auth
description: Use when GitHub clone, fetch, push, pull request, token, askpass, or gh authentication is failing or needs to be configured inside a worker.
---

# GitHub Auth Skill

Use this skill for GitHub authentication work inside the worker environment.

## Workflow

1. Prefer the bundled helper first:
   - `configure-github`
   - `~/configure-github.sh`
2. Check current auth state without exposing secrets:
   - `gh auth status`
   - `git config --global --get core.askPass`
   - remote URL style: SSH vs HTTPS
3. If the worker image should improve the default, update the image or entrypoint rather than adding ad hoc shell commands in docs.
4. In computer-use workers, use desktop MCP only when auth requires browser interaction:
   - `desktop-browser-dom` for normal web login flows
   - `desktop-browser-ui` and `desktop-input` for browser-owned popups or consent dialogs

## Rules

- Never print or echo secrets back to the user.
- Keep git and `gh` auth behavior aligned.
- If cloning a startup repository fails, prefer a recoverable path unless the user explicitly wants startup to fail hard.
- When GitHub auth is meant to persist inside the worker, use config files or helper scripts in the worker home directory.
- Prefer terminal auth first; switch to desktop MCP only for web-only auth, consent, or popup flows.

## Verification

- private repo clone succeeds
- `gh auth status` is healthy
- git HTTPS operations use askpass without interactive password prompts
