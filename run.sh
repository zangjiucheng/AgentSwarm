#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-agentswarm}"
IMAGE_TAG="${IMAGE_TAG:-agent-swarm:latest}"
WORKER_IMAGE_TAG="${WORKER_IMAGE_TAG:-agent-worker:latest}"
PORT="${PORT:-14000}"
CONFIG_FILE="${CONFIG_FILE:-$ROOT_DIR/apps/backend/config.json}"
CLEANUP_WORKERS=0
USE_REMOTE_IMAGES="${USE_REMOTE_IMAGES:-0}"
REMOTE_IMAGE_TAG="${REMOTE_IMAGE_TAG:-ghcr.io/zangjiucheng/agentswarm:latest}"
REMOTE_WORKER_IMAGE_TAG="${REMOTE_WORKER_IMAGE_TAG:-ghcr.io/zangjiucheng/agentswarm-worker:latest}"
GENERATED_CONFIG_DIR="${GENERATED_CONFIG_DIR:-$ROOT_DIR/.agentswarm}"
TMP_CONFIG_FILE=""

get_default_branch() {
  local ref
  ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  echo "${ref#origin/}"
}

pull_first_available_image() {
  local image_repo="$1"
  shift

  local tag
  local image
  local attempted=()

  for tag in "$@"; do
    if [ -z "$tag" ]; then
      continue
    fi

    image="${image_repo}:${tag}"
    attempted+=("$image")

    echo "Pulling $image" >&2
    if docker pull "$image" 1>&2; then
      echo "$image"
      return 0
    fi
  done

  echo "Failed to pull any remote image. Tried:" >&2
  printf '  %s\n' "${attempted[@]}" >&2
  return 1
}

while (($# > 0)); do
  case "$1" in
    --cleanup-workers)
      CLEANUP_WORKERS=1
      ;;
    --remote-images|--cloud-images)
      USE_REMOTE_IMAGES=1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--cleanup-workers] [--remote-images]" >&2
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

if [ "$USE_REMOTE_IMAGES" -eq 1 ]; then
  remote_image_repo="${REMOTE_IMAGE_TAG%:*}"
  remote_worker_image_repo="${REMOTE_WORKER_IMAGE_TAG%:*}"
  remote_image_default_tag="${REMOTE_IMAGE_TAG##*:}"
  remote_worker_image_default_tag="${REMOTE_WORKER_IMAGE_TAG##*:}"
  default_branch="$(get_default_branch)"

  if [ "$IMAGE_TAG" = "agent-swarm:latest" ]; then
    IMAGE_TAG="$(pull_first_available_image \
      "$remote_image_repo" \
      "$remote_image_default_tag" \
      "$default_branch")"
  fi

  if [ "$WORKER_IMAGE_TAG" = "agent-worker:latest" ]; then
    selected_remote_tag="${IMAGE_TAG##*:}"
    if [ "$selected_remote_tag" = "$remote_image_default_tag" ]; then
      WORKER_IMAGE_TAG="$(pull_first_available_image \
        "$remote_worker_image_repo" \
        "$remote_worker_image_default_tag" \
        "$default_branch")"
    else
      WORKER_IMAGE_TAG="$(pull_first_available_image \
        "$remote_worker_image_repo" \
        "$selected_remote_tag" \
        "$default_branch" \
        "$remote_worker_image_default_tag")"
    fi
  else
    echo "Pulling $WORKER_IMAGE_TAG"
    docker pull "$WORKER_IMAGE_TAG"
  fi

  if [ "$CLEANUP_WORKERS" -eq 1 ]; then
    echo "--cleanup-workers is ignored when using remote images." >&2
  fi

  source_config_file="$CONFIG_FILE"
  if [ ! -f "$source_config_file" ]; then
    echo "Config file not found: $source_config_file" >&2
    exit 1
  fi

  mkdir -p "$GENERATED_CONFIG_DIR"
  TMP_CONFIG_FILE="$GENERATED_CONFIG_DIR/${CONTAINER_NAME}-config.json"
  python3 - "$source_config_file" "$TMP_CONFIG_FILE" "$WORKER_IMAGE_TAG" <<'PY'
import json
import sys

source_path, output_path, worker_image_tag = sys.argv[1:4]

with open(source_path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

presets = []
for preset in data.get("presets", []):
    next_preset = dict(preset)
    next_preset["imageTag"] = worker_image_tag
    presets.append(next_preset)

with open(output_path, "w", encoding="utf-8") as fh:
    json.dump({"presets": presets}, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
  CONFIG_FILE="$TMP_CONFIG_FILE"
elif [ "$CLEANUP_WORKERS" -eq 1 ]; then
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
  -v "${CONTAINER_NAME}-data:/app/data"
)

if [ -n "${OPENAI_API_KEY:-}" ]; then
  DOCKER_ARGS+=(-e "OPENAI_API_KEY=$OPENAI_API_KEY")
fi

if [ -f "$CONFIG_FILE" ]; then
  DOCKER_ARGS+=(-e "CONFIG_PATH=/app/config.json")
  DOCKER_ARGS+=(-v "$CONFIG_FILE:/app/config.json")
  DOCKER_ARGS+=(-v "$CONFIG_FILE:/app/apps/backend/config.json")
fi

DOCKER_ARGS+=("$IMAGE_TAG")

docker "${DOCKER_ARGS[@]}"

echo "AgentSwarm is running at http://localhost:$PORT"
echo "App image: $IMAGE_TAG"
echo "Worker image: $WORKER_IMAGE_TAG"

if [ "$USE_REMOTE_IMAGES" -eq 1 ]; then
  echo "Remote image mode is enabled."
elif [ "$CLEANUP_WORKERS" -eq 0 ]; then
  echo "Existing worker containers were preserved."
fi
