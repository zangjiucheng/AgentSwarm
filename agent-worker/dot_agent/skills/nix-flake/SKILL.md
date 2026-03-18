---
name: nix-flake
description: When working in a NixOS-based worker or a flake-enabled project, prefer updating the project's flake.nix to add missing dependencies and enter that environment.
---

# Nix Flake Skill

Use this skill when the project is running inside the NixOS worker and the required tool or library is missing.

## Rules

1. If the repository already has `flake.nix`, prefer editing that file instead of installing tools globally.
2. Add project dependencies to the appropriate place in the flake:
   - `devShells` for development tools such as `nodejs`, `bun`, `python`, `ripgrep`, `ffmpeg`, `playwright`, etc.
   - `packages` only when the repository is actually building a package output.
3. If the dependency set changes, also update `flake.lock` when needed.
4. Keep the change project-scoped. Do not modify the worker image or system-level Nix config unless the user explicitly asks for that.
5. After editing the flake, use `nix develop`, `nix shell`, or the repo's documented Nix command to verify the dependency is available.

## Preferred workflow

1. Detect whether the repo has `flake.nix`.
2. Find the existing shell/package structure before editing.
3. Add the smallest dependency needed.
4. Re-enter the Nix environment and verify the command works.
5. Tell the user which dependency was added and where.
