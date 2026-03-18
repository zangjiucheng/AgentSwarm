#! /bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_TAG="${IMAGE_TAG:-agent-swarm:latest}"

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

./agent-worker/build.sh
cleanup_image "$IMAGE_TAG"
prune_dangling_images

docker build "${BUILD_ARGS[@]}" -t "$IMAGE_TAG" .
