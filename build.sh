#! /bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_TAG="${IMAGE_TAG:-agent-swarm:latest}"
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

cleanup_image() {
  local image_tag="$1"
  local container_ids

  container_ids="$(docker ps -aq --filter "ancestor=${image_tag}" || true)"
  if [ -n "$container_ids" ]; then
    docker rm -f $container_ids >/dev/null
  fi

  if docker image inspect "$image_tag" >/dev/null 2>&1; then
    docker image rm -f "$image_tag" >/dev/null
  fi
}

prune_dangling_images() {
  docker image prune -f >/dev/null 2>&1 || true
}

prune_build_cache() {
  docker builder prune -af >/dev/null 2>&1 || true
}

DOCKER_PLATFORMS="${DOCKER_PLATFORMS:-}"
if [ -z "$DOCKER_PLATFORMS" ] && [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
  DOCKER_PLATFORMS="linux/arm64"
fi

case "$DOCKER_PLATFORMS" in
  *,*)
    echo "Set DOCKER_PLATFORMS to a single platform." >&2
    exit 1
    ;;
esac

BUILD_ARGS=()
if [ -n "$DOCKER_PLATFORMS" ]; then
  BUILD_ARGS+=(--platform "$DOCKER_PLATFORMS")
fi

cd "$ROOT_DIR"

if [ "$CLEANUP_WORKERS" -eq 1 ]; then
  ./agent-worker/build.sh --cleanup-workers
  cleanup_image "$IMAGE_TAG"
  prune_dangling_images
else
  ./agent-worker/build.sh
fi

prune_build_cache

docker build "${BUILD_ARGS[@]}" -t "$IMAGE_TAG" .
