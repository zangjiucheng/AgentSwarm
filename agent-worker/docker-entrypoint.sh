#!/usr/bin/env bash

set -euo pipefail

HOME_DIR="/home/kasm-user"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME_DIR/workers}"
CODE_SERVER_PORT="${CODE_SERVER_PORT:-51300}"
STARTUP_REPO_URL="${STARTUP_REPO_URL:-}"
BASH_BIN="$(readlink -f "$(command -v bash)")"
SETPRIV_BIN="$(readlink -f "$(command -v setpriv)")"

mkdir -p /var/run /var/lib/docker
chown -R 1000:1000 "$HOME_DIR"

dockerd \
  --host=unix:///var/run/docker.sock \
  --storage-driver=vfs \
  >/tmp/dockerd.log 2>&1 &
DOCKERD_PID=$!

cleanup() {
  if kill -0 "$DOCKERD_PID" >/dev/null 2>&1; then
    kill "$DOCKERD_PID" >/dev/null 2>&1 || true
    wait "$DOCKERD_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker info >/dev/null 2>&1; then
  echo "dockerd failed to start" >&2
  cat /tmp/dockerd.log >&2 || true
  exit 1
fi

exec "$SETPRIV_BIN" \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  env \
  HOME="$HOME_DIR" \
  USER="kasm-user" \
  WORKSPACE_DIR="$WORKSPACE_DIR" \
  STARTUP_REPO_URL="$STARTUP_REPO_URL" \
  CODE_SERVER_PORT="$CODE_SERVER_PORT" \
  "$BASH_BIN" -lc '
    set -euo pipefail

    if [ -n "${STARTUP_REPO_URL}" ]; then
      parent_dir="$(dirname "$WORKSPACE_DIR")"
      mkdir -p "$parent_dir"

      if [ -d "$WORKSPACE_DIR/.git" ]; then
        :
      else
        if [ -e "$WORKSPACE_DIR" ] && [ ! -d "$WORKSPACE_DIR" ]; then
          echo "workspace path exists and is not a directory: $WORKSPACE_DIR" >&2
          exit 1
        fi

        if [ -d "$WORKSPACE_DIR" ] && [ -n "$(find "$WORKSPACE_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
          echo "workspace directory exists and is not empty: $WORKSPACE_DIR" >&2
          exit 1
        fi

        if [ -d "$WORKSPACE_DIR" ]; then
          rmdir "$WORKSPACE_DIR"
        fi

        git clone "$STARTUP_REPO_URL" "$WORKSPACE_DIR"
      fi
    else
      mkdir -p "$WORKSPACE_DIR"
    fi

    cd "$WORKSPACE_DIR"
    exec code-server \
      --auth none \
      --bind-addr 0.0.0.0:${CODE_SERVER_PORT} \
      --disable-telemetry \
      "$WORKSPACE_DIR"
  '
