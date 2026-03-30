#!/usr/bin/env bash

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]-}"
ROOT_DIR=""
if [ -n "$SCRIPT_PATH" ] && [ "$SCRIPT_PATH" != "-" ]; then
  ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || true)"
fi

HAS_LOCAL_CHECKOUT=0
if [ -n "$ROOT_DIR" ] && [ -f "$ROOT_DIR/build.sh" ] && [ -f "$ROOT_DIR/apps/backend/config.json" ]; then
  HAS_LOCAL_CHECKOUT=1
fi

CONTAINER_NAME="${CONTAINER_NAME:-agentswarm}"
IMAGE_TAG="${IMAGE_TAG:-agent-swarm:latest}"
WORKER_IMAGE_TAG="${WORKER_IMAGE_TAG:-agent-worker:latest}"
PORT="${PORT:-14000}"
CONFIG_FILE="${CONFIG_FILE:-}"
CLEANUP_WORKERS=0
USE_REMOTE_IMAGES="${USE_REMOTE_IMAGES:-0}"
REMOTE_IMAGE_TAG="${REMOTE_IMAGE_TAG:-ghcr.io/zangjiucheng/agentswarm:latest}"
REMOTE_WORKER_IMAGE_TAG="${REMOTE_WORKER_IMAGE_TAG:-ghcr.io/zangjiucheng/agentswarm-worker:latest}"
if [ -z "$CONFIG_FILE" ] && [ "$HAS_LOCAL_CHECKOUT" -eq 1 ]; then
  CONFIG_FILE="$ROOT_DIR/apps/backend/config.json"
fi

if [ "$HAS_LOCAL_CHECKOUT" -eq 1 ]; then
  GENERATED_CONFIG_DIR="${GENERATED_CONFIG_DIR:-$ROOT_DIR/.agentswarm}"
else
  GENERATED_CONFIG_DIR="${GENERATED_CONFIG_DIR:-${HOME:-/tmp}/.agentswarm}"
fi
TMP_CONFIG_FILE=""
GENERATED_ADMIN_TOKEN_FILE=""

generate_admin_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  local python_bin=""
  python_bin="$(find_python_bin || true)"
  if [ -n "$python_bin" ]; then
    "$python_bin" - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return 0
  fi

  if [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    return 0
  fi

  return 1
}

resolve_admin_token() {
  if [ -n "${AGENTSWARM_ADMIN_TOKEN:-}" ]; then
    printf '%s\n' "$AGENTSWARM_ADMIN_TOKEN"
    return 0
  fi

  mkdir -p "$GENERATED_CONFIG_DIR"
  GENERATED_ADMIN_TOKEN_FILE="$GENERATED_CONFIG_DIR/${CONTAINER_NAME}-admin-token"

  if [ -f "$GENERATED_ADMIN_TOKEN_FILE" ]; then
    cat "$GENERATED_ADMIN_TOKEN_FILE"
    return 0
  fi

  local generated=""
  generated="$(generate_admin_token)" || {
    echo "Failed to generate AGENTSWARM_ADMIN_TOKEN automatically." >&2
    exit 1
  }

  printf '%s\n' "$generated" > "$GENERATED_ADMIN_TOKEN_FILE"
  chmod 600 "$GENERATED_ADMIN_TOKEN_FILE" 2>/dev/null || true
  printf '%s\n' "$generated"
}

find_python_bin() {
  local candidate=""
  local resolved=""

  for candidate in "${PYTHON_BIN:-}" python python3 /usr/bin/python3 /usr/local/bin/python3 /bin/python3; do
    if [ -z "$candidate" ]; then
      continue
    fi

    if [[ "$candidate" = /* ]]; then
      if [ ! -x "$candidate" ]; then
        continue
      fi
      resolved="$candidate"
    else
      resolved="$(command -v "$candidate" 2>/dev/null || true)"
      if [ -z "$resolved" ]; then
        continue
      fi
    fi

    if "$resolved" -c 'import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
      printf '%s\n' "$resolved"
      return 0
    fi
  done

  return 1
}

get_default_branch() {
  local ref
  if [ "$HAS_LOCAL_CHECKOUT" -eq 0 ]; then
    return 0
  fi
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

write_default_config() {
  local output_path="$1"
  local worker_image_tag="$2"

  cat > "$output_path" <<EOF
{
  "drinode": "/dev/dri/renderD128",
  "presets": [
    {
      "name": "default",
      "imageTag": "$worker_image_tag",
      "presetEnv": {
        "GIT_AUTHOR_NAME": "Agent Swarm",
        "GIT_AUTHOR_EMAIL": "agentswarm@local",
        "GIT_COMMITTER_NAME": "Agent Swarm",
        "GIT_COMMITTER_EMAIL": "agentswarm@local"
      },
      "requiredEnv": []
    },
    {
      "name": "frontend",
      "imageTag": "$worker_image_tag",
      "presetEnv": {
        "GIT_AUTHOR_NAME": "Agent Swarm Frontend",
        "GIT_AUTHOR_EMAIL": "frontend@agentswarm.local",
        "GIT_COMMITTER_NAME": "Agent Swarm Frontend",
        "GIT_COMMITTER_EMAIL": "frontend@agentswarm.local",
        "NODE_ENV": "development",
        "BROWSER": "none"
      },
      "requiredEnv": []
    },
    {
      "name": "fullstack",
      "imageTag": "$worker_image_tag",
      "presetEnv": {
        "GIT_AUTHOR_NAME": "Agent Swarm Fullstack",
        "GIT_AUTHOR_EMAIL": "fullstack@agentswarm.local",
        "GIT_COMMITTER_NAME": "Agent Swarm Fullstack",
        "GIT_COMMITTER_EMAIL": "fullstack@agentswarm.local",
        "NODE_ENV": "development"
      },
      "requiredEnv": []
    },
    {
      "name": "oss-contrib",
      "imageTag": "$worker_image_tag",
      "presetEnv": {
        "GIT_AUTHOR_NAME": "Agent Swarm OSS",
        "GIT_AUTHOR_EMAIL": "oss@agentswarm.local",
        "GIT_COMMITTER_NAME": "Agent Swarm OSS",
        "GIT_COMMITTER_EMAIL": "oss@agentswarm.local",
        "GH_PROMPT_DISABLED": "1"
      },
      "requiredEnv": []
    },
    {
      "name": "ai-agent",
      "imageTag": "$worker_image_tag",
      "presetEnv": {
        "GIT_AUTHOR_NAME": "Agent Swarm AI Agent",
        "GIT_AUTHOR_EMAIL": "ai@agentswarm.local",
        "GIT_COMMITTER_NAME": "Agent Swarm AI Agent",
        "GIT_COMMITTER_EMAIL": "ai@agentswarm.local",
        "NODE_ENV": "development"
      },
      "requiredEnv": [
        "OPENAI_API_KEY"
      ]
    }
  ]
}
EOF
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

if [ "$HAS_LOCAL_CHECKOUT" -eq 1 ]; then
  cd "$ROOT_DIR"
fi

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
  mkdir -p "$GENERATED_CONFIG_DIR"
  TMP_CONFIG_FILE="$GENERATED_CONFIG_DIR/${CONTAINER_NAME}-config.json"

  if [ -n "$source_config_file" ] && [ -f "$source_config_file" ]; then
    PYTHON_BIN="$(find_python_bin || true)"
    if [ -z "$PYTHON_BIN" ]; then
      echo "Python 3 is required to rewrite the generated config. Set PYTHON_BIN to a working interpreter if needed." >&2
      exit 1
    fi

    "$PYTHON_BIN" - "$source_config_file" "$TMP_CONFIG_FILE" "$WORKER_IMAGE_TAG" <<'PY'
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

data["presets"] = presets

with open(output_path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
  else
    write_default_config "$TMP_CONFIG_FILE" "$WORKER_IMAGE_TAG"
  fi
  CONFIG_FILE="$TMP_CONFIG_FILE"
elif [ "$CLEANUP_WORKERS" -eq 1 ]; then
  if [ "$HAS_LOCAL_CHECKOUT" -eq 0 ]; then
    echo "Local cleanup builds require a repository checkout. Use --remote-images when running from curl." >&2
    exit 1
  fi
  ./build.sh --cleanup-workers
else
  if [ "$HAS_LOCAL_CHECKOUT" -eq 0 ]; then
    echo "Local build mode requires a repository checkout. Use --remote-images when running from curl." >&2
    exit 1
  fi
  ./build.sh
fi

if command -v docker >/dev/null 2>&1; then
  existing_container_id="$(docker ps -aq --filter "name=^${CONTAINER_NAME}$" || true)"
  if [ -n "$existing_container_id" ]; then
    docker rm -f "$existing_container_id" >/dev/null
  fi
fi

AGENTSWARM_ADMIN_TOKEN_VALUE="$(resolve_admin_token)"

DOCKER_ARGS=(
  run
  -d
  --name "$CONTAINER_NAME"
  -e "AGENTSWARM_VERSION=$IMAGE_TAG"
  -e "AGENTSWARM_WORKER_VERSION=$WORKER_IMAGE_TAG"
  -e "AGENTSWARM_ADMIN_TOKEN=$AGENTSWARM_ADMIN_TOKEN_VALUE"
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
echo "Admin token: $AGENTSWARM_ADMIN_TOKEN_VALUE"
if [ -n "$GENERATED_ADMIN_TOKEN_FILE" ]; then
  echo "Saved admin token: $GENERATED_ADMIN_TOKEN_FILE"
fi

if [ "$USE_REMOTE_IMAGES" -eq 1 ]; then
  echo "Remote image mode is enabled."
elif [ "$CLEANUP_WORKERS" -eq 0 ]; then
  echo "Existing worker containers were preserved."
fi
