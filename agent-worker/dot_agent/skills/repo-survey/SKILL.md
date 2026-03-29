---
name: repo-survey
description: Use when the user asks to explore an unfamiliar repository, explain architecture, locate entry points, or map build, run, and test workflows before making changes.
---

# Repo Survey Skill

Use this skill to build a fast, accurate mental model of a codebase before editing.

## Workflow

1. Start with the smallest high-signal files:
   - `README.md`
   - root manifests such as `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`
   - container and orchestration files such as `Dockerfile`, `docker-compose.yml`, `compose.yaml`
2. Identify the top-level apps, packages, or services before reading implementation files.
3. Use fast search first:
   - `rg --files` for manifests and entry points
   - `rg -n` for route names, server startup, CLI commands, env vars, and build scripts
4. Read only the files needed to answer:
   - what runs where
   - how the project starts
   - how data or requests move between major components
5. End with a concise survey:
   - repo structure
   - important entry points
   - run/build/test workflow
   - notable risks, stale docs, or open questions

## Rules

- Prefer a small map over a long walkthrough.
- Distinguish confirmed facts from inference.
- Do not bulk-read large folders when manifests and entry points can narrow the path first.
- If the user wants code changes next, use this survey to choose the smallest edit surface.
