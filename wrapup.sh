#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-agentswarm}"
IMAGE_TAG="${IMAGE_TAG:-${AGENT_SWARM_IMAGE_TAG:-agent-swarm:latest}}"
WORKER_IMAGE_TAG="${WORKER_IMAGE_TAG:-${AGENT_WORKER_IMAGE_TAG:-agent-worker:latest}}"
USE_REMOTE_IMAGES="${USE_REMOTE_IMAGES:-0}"
REMOTE_IMAGE_TAG="${REMOTE_IMAGE_TAG:-ghcr.io/zangjiucheng/agentswarm:latest}"
REMOTE_WORKER_IMAGE_TAG="${REMOTE_WORKER_IMAGE_TAG:-ghcr.io/zangjiucheng/agentswarm-worker:latest}"
GENERATED_CONFIG_DIR="${GENERATED_CONFIG_DIR:-$ROOT_DIR/.agentswarm}"

get_current_branch() {
  git branch --show-current 2>/dev/null || true
}

get_default_branch() {
  local ref
  ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  echo "${ref#origin/}"
}

append_unique_image() {
  local image="$1"

  if [ -z "$image" ]; then
    return
  fi

  local existing
  for existing in "${IMAGE_TAGS[@]}"; do
    if [ "$existing" = "$image" ]; then
      return
    fi
  done

  IMAGE_TAGS+=("$image")
}

ROOT_IMAGE_REPO="${REMOTE_IMAGE_TAG%:*}"
WORKER_IMAGE_REPO="${REMOTE_WORKER_IMAGE_TAG%:*}"
REMOTE_IMAGE_DEFAULT_TAG="${REMOTE_IMAGE_TAG##*:}"
REMOTE_WORKER_IMAGE_DEFAULT_TAG="${REMOTE_WORKER_IMAGE_TAG##*:}"
CURRENT_BRANCH="$(get_current_branch)"
DEFAULT_BRANCH="$(get_default_branch)"

IMAGE_TAGS=()

append_unique_image "$IMAGE_TAG"
append_unique_image "$WORKER_IMAGE_TAG"

if [ "$USE_REMOTE_IMAGES" -eq 1 ]; then
  append_unique_image "$REMOTE_IMAGE_TAG"
  append_unique_image "$REMOTE_WORKER_IMAGE_TAG"

  if [ -n "$DEFAULT_BRANCH" ]; then
    append_unique_image "${ROOT_IMAGE_REPO}:${DEFAULT_BRANCH}"
    append_unique_image "${WORKER_IMAGE_REPO}:${DEFAULT_BRANCH}"
  fi

  if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ]; then
    append_unique_image "${ROOT_IMAGE_REPO}:${CURRENT_BRANCH}"
    append_unique_image "${WORKER_IMAGE_REPO}:${CURRENT_BRANCH}"
  fi

  append_unique_image "${ROOT_IMAGE_REPO}:${REMOTE_IMAGE_DEFAULT_TAG}"
  append_unique_image "${WORKER_IMAGE_REPO}:${REMOTE_WORKER_IMAGE_DEFAULT_TAG}"
fi

"$ROOT_DIR/clean.sh"

if [ -d "$GENERATED_CONFIG_DIR" ]; then
  rm -f "$GENERATED_CONFIG_DIR/${CONTAINER_NAME}-config.json"
  rmdir "$GENERATED_CONFIG_DIR" >/dev/null 2>&1 || true
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found, skipped container and image cleanup"
  exit 0
fi

container_ids="$(docker ps -aq --filter "name=^${CONTAINER_NAME}$" || true)"
if [ -n "$container_ids" ]; then
  docker rm -f $container_ids
  echo "Removed container ${CONTAINER_NAME}"
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
