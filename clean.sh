#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGETS=(
  "$ROOT_DIR/.turbo"
  "$ROOT_DIR/node_modules"
  "$ROOT_DIR/apps/backend/.turbo"
  "$ROOT_DIR/apps/backend/dist"
  "$ROOT_DIR/apps/backend/node_modules"
  "$ROOT_DIR/apps/frontend/.turbo"
  "$ROOT_DIR/apps/frontend/dist"
  "$ROOT_DIR/apps/frontend/node_modules"
  "$ROOT_DIR/apps/monitor/.turbo"
  "$ROOT_DIR/apps/monitor/dist"
  "$ROOT_DIR/apps/monitor/node_modules"
)

for target in "${TARGETS[@]}"; do
  if [ -e "$target" ]; then
    rm -rf "$target"
    echo "Removed $target"
  fi
done
