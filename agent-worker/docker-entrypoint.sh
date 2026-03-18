#!/usr/bin/env bash

set -euo pipefail

HOME_DIR="/home/kasm-user"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME_DIR/workers}"
CODE_SERVER_PORT="${CODE_SERVER_PORT:-51300}"

mkdir -p "$WORKSPACE_DIR" /var/run /var/lib/docker
chown -R kasm-user:kasm-user "$HOME_DIR"

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

exec su -s /bin/bash kasm-user -c "
  mkdir -p \"$WORKSPACE_DIR\"
  cd \"$WORKSPACE_DIR\"
  exec code-server \
    --auth none \
    --bind-addr 0.0.0.0:${CODE_SERVER_PORT} \
    --disable-telemetry \
    \"$WORKSPACE_DIR\"
"
