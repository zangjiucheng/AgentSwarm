#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-agentswarm}"
IMAGE_TAG="${IMAGE_TAG:-agent-swarm:latest}"
PORT="${PORT:-14000}"
CONFIG_FILE="${CONFIG_FILE:-$ROOT_DIR/apps/backend/config.json}"
CLEANUP_WORKERS=0

while (($# > 0)); do
  case "$1" in
    --cleanup-workers)
      CLEANUP_WORKERS=1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--cleanup-workers]" >&2
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

if [ "$CLEANUP_WORKERS" -eq 1 ]; then
  ./build.sh --cleanup-workers
else
  ./build.sh
fi

if command -v docker >/dev/null 2>&1; then
  existing_container_id="$(docker ps -aq --filter "name=^${CONTAINER_NAME}$" || true)"
  if [ -n "$existing_container_id" ]; then
    docker rm -f "$existing_container_id" >/dev/null
  fi
fi

DOCKER_ARGS=(
  run
  -d
  --name "$CONTAINER_NAME"
  -e "PORT=$PORT"
  -p "$PORT:$PORT"
  -v /var/run/docker.sock:/var/run/docker.sock
)

if [ -f "$CONFIG_FILE" ]; then
  DOCKER_ARGS+=(-v "$CONFIG_FILE:/app/config.json")
fi

DOCKER_ARGS+=("$IMAGE_TAG")

docker "${DOCKER_ARGS[@]}"

echo "AgentSwarm is running at http://localhost:$PORT"

if [ "$CLEANUP_WORKERS" -eq 0 ]; then
  echo "Existing worker containers were preserved."
fi
