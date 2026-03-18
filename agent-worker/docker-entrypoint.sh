#!/usr/bin/env bash

set -euo pipefail

HOME_DIR="/home/kasm-user"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME_DIR/workers}"
CODE_SERVER_PORT="${CODE_SERVER_PORT:-51300}"
MONITOR_PORT="${MONITOR_PORT:-51301}"
STARTUP_REPO_URL="${STARTUP_REPO_URL:-}"
BASH_BIN="$(readlink -f "$(command -v bash)")"
SETPRIV_BIN="$(readlink -f "$(command -v setpriv)")"
NIX_DAEMON_BIN="$(readlink -f "$(command -v nix-daemon)")"
BUN_BIN="$(readlink -f "$(command -v bun)")"
MONITOR_SCRIPT="/usr/local/bin/monitor.js"

mkdir -p /var/run /var/lib/docker
chown -R 1000:1000 "$HOME_DIR"

"$NIX_DAEMON_BIN" >/tmp/nix-daemon.log 2>&1 &
NIX_DAEMON_PID=$!

dockerd \
  --host=unix:///var/run/docker.sock \
  --storage-driver=vfs \
  >/tmp/dockerd.log 2>&1 &
DOCKERD_PID=$!

cleanup() {
  if kill -0 "$NIX_DAEMON_PID" >/dev/null 2>&1; then
    kill "$NIX_DAEMON_PID" >/dev/null 2>&1 || true
    wait "$NIX_DAEMON_PID" 2>/dev/null || true
  fi

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
  NIX_REMOTE=daemon \
  USER="kasm-user" \
  WORKSPACE_DIR="$WORKSPACE_DIR" \
  STARTUP_REPO_URL="$STARTUP_REPO_URL" \
  CODE_SERVER_PORT="$CODE_SERVER_PORT" \
  MONITOR_PORT="$MONITOR_PORT" \
  BUN_BIN="$BUN_BIN" \
  MONITOR_SCRIPT="$MONITOR_SCRIPT" \
  "$BASH_BIN" -lc '
    set -euo pipefail

    github_https_url_from_repo() {
      local repo_url="$1"

      if [[ "$repo_url" =~ ^git@github\.com:(.+)$ ]]; then
        printf "https://github.com/%s\n" "${BASH_REMATCH[1]}"
        return 0
      fi

      if [[ "$repo_url" =~ ^ssh://git@github\.com/(.+)$ ]]; then
        printf "https://github.com/%s\n" "${BASH_REMATCH[1]}"
        return 0
      fi

      if [[ "$repo_url" =~ ^https://github\.com/.+ ]]; then
        printf "%s\n" "$repo_url"
        return 0
      fi

      return 1
    }

    ensure_github_known_host() {
      mkdir -p "$HOME/.ssh"
      chmod 700 "$HOME/.ssh"
      touch "$HOME/.ssh/known_hosts"
      chmod 600 "$HOME/.ssh/known_hosts"

      if command -v ssh-keyscan >/dev/null 2>&1; then
        ssh-keyscan -H github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
      fi

      export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o StrictHostKeyChecking=accept-new}"
    }

    configure_github_askpass() {
      if [ -z "${GITHUB_TOKEN:-}" ]; then
        return 0
      fi

      local askpass_dir="$HOME/.local/bin"
      local askpass_script="$askpass_dir/github-askpass"

      mkdir -p "$askpass_dir"

      cat > "$askpass_script" <<EOF
#!/usr/bin/env bash
case "\${1:-}" in
  *Username*github.com*)
    printf "%s\n" "\${GITHUB_USERNAME:-git}"
    ;;
  *Password*github.com*)
    printf "%s\n" "\${GITHUB_TOKEN}"
    ;;
  *)
    exit 1
    ;;
esac
EOF

      chmod 700 "$askpass_script"
      export GIT_ASKPASS="$askpass_script"
      export GIT_TERMINAL_PROMPT=0
    }

    clone_repository() {
      local repo_url="$1"
      local destination="$2"
      local temp_dir="${destination}.tmp-clone-$$"

      rm -rf "$temp_dir"

      if [ -n "${GITHUB_TOKEN:-}" ]; then
        local https_repo_url
        if https_repo_url="$(github_https_url_from_repo "$repo_url")"; then
          configure_github_askpass

          if git clone "$https_repo_url" "$temp_dir"; then
            git -C "$temp_dir" remote set-url origin "$https_repo_url"
            mv "$temp_dir" "$destination"
            return 0
          fi

          rm -rf "$temp_dir"
          echo "GitHub token authentication failed for $https_repo_url" >&2
          return 1
        fi
      fi

      if [[ "$repo_url" =~ ^git@github\.com:.+ || "$repo_url" =~ ^ssh://git@github\.com/.+ ]]; then
        ensure_github_known_host
      fi

      git clone "$repo_url" "$temp_dir"
      mv "$temp_dir" "$destination"
    }

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

        clone_repository "$STARTUP_REPO_URL" "$WORKSPACE_DIR"
      fi
    else
      mkdir -p "$WORKSPACE_DIR"
    fi

    "$BUN_BIN" "$MONITOR_SCRIPT" >/tmp/monitor.log 2>&1 &

    cd "$WORKSPACE_DIR"
    exec code-server \
      --auth none \
      --bind-addr 0.0.0.0:${CODE_SERVER_PORT} \
      --disable-telemetry \
      "$WORKSPACE_DIR"
  '
