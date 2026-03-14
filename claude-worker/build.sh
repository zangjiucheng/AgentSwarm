#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR/../apps/monitor"
bun install --frozen-lockfile
bun run build

cd "$ROOT_DIR"
cp "$ROOT_DIR/../apps/monitor/dist/monitor" "$ROOT_DIR/monitor"
docker build -t pegasis0/claude-worker:latest .