#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IMAGE_TAGS=(
  "${AGENT_WORKER_IMAGE_TAG:-agent-worker:latest}"
  "${AGENT_SWARM_IMAGE_TAG:-agent-swarm:latest}"
)

"$ROOT_DIR/clean.sh"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found, skipped container and image cleanup"
  exit 0
fi

for image in "${IMAGE_TAGS[@]}"; do
  container_ids="$(docker ps -aq --filter "ancestor=$image" || true)"
  if [ -n "$container_ids" ]; then
    docker rm -f $container_ids
    echo "Removed containers for $image"
  fi

  if docker image inspect "$image" >/dev/null 2>&1; then
    docker image rm -f "$image"
    echo "Removed image $image"
  fi
done
