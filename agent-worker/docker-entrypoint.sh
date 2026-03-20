#!/usr/bin/env bash

set -euo pipefail

HOME_DIR="/home/kasm-user"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME_DIR/workers}"
CODE_SERVER_PORT="${CODE_SERVER_PORT:-51300}"
MONITOR_PORT="${MONITOR_PORT:-51301}"
SSH_PORT="${SSH_PORT:-2222}"
STARTUP_REPO_URL="${STARTUP_REPO_URL:-}"
WORKER_SSH_ENABLED="${WORKER_SSH_ENABLED:-0}"
WORKER_SSH_AUTHORIZED_KEYS="${WORKER_SSH_AUTHORIZED_KEYS:-${WORKER_SSH_AUTHORIZED_KEY:-}}"
WORKER_SSH_PASSWORD="${WORKER_SSH_PASSWORD:-}"
BASH_BIN="$(readlink -f "$(command -v bash)")"
SETPRIV_BIN="$(readlink -f "$(command -v setpriv)")"
NIX_DAEMON_BIN="$(readlink -f "$(command -v nix-daemon)")"
BUN_BIN="$(readlink -f "$(command -v bun)")"
CHPASSWD_BIN="$(readlink -f "$(command -v chpasswd)")"
DROPBEAR_BIN="$(readlink -f "$(command -v dropbear)")"
DROPBEARKEY_BIN="$(readlink -f "$(command -v dropbearkey)")"
MONITOR_SCRIPT="/usr/local/bin/monitor.js"
BUN_PTY_LIB=""
ARCH="$(uname -m)"

if [ "$ARCH" = "aarch64" ] && [ -f /usr/local/lib/bun-pty/librust_pty_arm64.so ]; then
  BUN_PTY_LIB="/usr/local/lib/bun-pty/librust_pty_arm64.so"
elif [ -f /usr/local/lib/bun-pty/librust_pty.so ]; then
  BUN_PTY_LIB="/usr/local/lib/bun-pty/librust_pty.so"
elif [ -f /usr/local/lib/bun-pty/librust_pty_arm64.so ]; then
  BUN_PTY_LIB="/usr/local/lib/bun-pty/librust_pty_arm64.so"
fi

mkdir -p /var/run /var/lib/docker
chown -R 1000:1000 "$HOME_DIR"

"$NIX_DAEMON_BIN" >/tmp/nix-daemon.log 2>&1 &
NIX_DAEMON_PID=$!

DOCKERD_PID=""
SSHD_PID=""

cleanup_docker_runtime_state() {
  local pid=""

  for pidfile in \
    /var/run/docker.pid \
    /var/run/docker/containerd/containerd.pid \
    /var/run/containerd/containerd.pid
  do
    if [ ! -f "$pidfile" ]; then
      continue
    fi

    pid="$(cat "$pidfile" 2>/dev/null || true)"

    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      case "$(ps -p "$pid" -o comm= 2>/dev/null | tr -d "[:space:]")" in
        dockerd|containerd)
          kill "$pid" >/dev/null 2>&1 || true
          wait "$pid" 2>/dev/null || true
          ;;
      esac
    fi

    rm -f "$pidfile"
  done

  pkill -x containerd >/dev/null 2>&1 || true
  pkill -x dockerd >/dev/null 2>&1 || true
}

if docker info >/dev/null 2>&1; then
  :
else
  cleanup_docker_runtime_state

  if ! docker info >/dev/null 2>&1; then
    dockerd \
      --host=unix:///var/run/docker.sock \
      --storage-driver=vfs \
      >/tmp/dockerd.log 2>&1 &
    DOCKERD_PID=$!
  fi
fi

setup_sshd() {
  if [ "$WORKER_SSH_ENABLED" != "1" ]; then
    return 0
  fi

  mkdir -p /etc/dropbear /run

  if [ -L /etc/passwd ]; then
    cp -L /etc/passwd /tmp/passwd
    rm -f /etc/passwd
    cp /tmp/passwd /etc/passwd
    chmod 644 /etc/passwd
  fi

  if [ -L /etc/shadow ]; then
    cp -L /etc/shadow /tmp/shadow
    rm -f /etc/shadow
    cp /tmp/shadow /etc/shadow
    chmod 600 /etc/shadow
  fi

  mkdir -p "$HOME_DIR/.ssh"
  chmod 700 "$HOME_DIR/.ssh"
  touch "$HOME_DIR/.ssh/authorized_keys"
  chmod 600 "$HOME_DIR/.ssh/authorized_keys"
  chown -R 1000:1000 "$HOME_DIR/.ssh"

  if [ -n "$WORKER_SSH_AUTHORIZED_KEYS" ]; then
    printf '%s\n' "$WORKER_SSH_AUTHORIZED_KEYS" > "$HOME_DIR/.ssh/authorized_keys"
    chmod 600 "$HOME_DIR/.ssh/authorized_keys"
    chown 1000:1000 "$HOME_DIR/.ssh/authorized_keys"
  fi

  if [ -z "$WORKER_SSH_AUTHORIZED_KEYS" ] && [ -n "$WORKER_SSH_PASSWORD" ]; then
    printf 'kasm-user:%s\n' "$WORKER_SSH_PASSWORD" | "$CHPASSWD_BIN" -c SHA512
  fi

  if [ ! -f /etc/dropbear/dropbear_ed25519_host_key ]; then
    "$DROPBEARKEY_BIN" -t ed25519 -f /etc/dropbear/dropbear_ed25519_host_key >/tmp/ssh-keygen.log 2>&1 || {
      cat /tmp/ssh-keygen.log >&2 || true
      return 1
    }
  fi

  "$DROPBEAR_BIN" \
    -F \
    -E \
    -w \
    $([ -n "$WORKER_SSH_AUTHORIZED_KEYS" ] && printf '%s' '-s') \
    -p "$SSH_PORT" \
    -r /etc/dropbear/dropbear_ed25519_host_key \
    >/tmp/sshd.log 2>&1 &
  SSHD_PID=$!
}

setup_sshd

cleanup() {
  if [ -n "$SSHD_PID" ] && kill -0 "$SSHD_PID" >/dev/null 2>&1; then
    kill "$SSHD_PID" >/dev/null 2>&1 || true
    wait "$SSHD_PID" 2>/dev/null || true
  fi

  if kill -0 "$NIX_DAEMON_PID" >/dev/null 2>&1; then
    kill "$NIX_DAEMON_PID" >/dev/null 2>&1 || true
    wait "$NIX_DAEMON_PID" 2>/dev/null || true
  fi

  if [ -n "$DOCKERD_PID" ] && kill -0 "$DOCKERD_PID" >/dev/null 2>&1; then
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
  BUN_PTY_LIB="$BUN_PTY_LIB" \
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

    configure_github_auth() {
      if [ -z "${GITHUB_TOKEN:-}" ]; then
        return 0
      fi

      configure_github_askpass

      if [ -n "${GITHUB_USERNAME:-}" ]; then
        git config --global credential.username "$GITHUB_USERNAME"
      fi

      git config --global core.askPass "$GIT_ASKPASS"
      git config --global credential.helper ""

      if command -v gh >/dev/null 2>&1; then
        if ! gh auth status >/dev/null 2>&1; then
          printenv GITHUB_TOKEN | gh auth login --hostname github.com --with-token >/tmp/gh-auth.log 2>&1 || cat /tmp/gh-auth.log >&2
        fi

        gh auth setup-git >/tmp/gh-auth-setup-git.log 2>&1 || cat /tmp/gh-auth-setup-git.log >&2
      fi
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

      if git clone "$repo_url" "$temp_dir"; then
        mv "$temp_dir" "$destination"
        return 0
      fi

      rm -rf "$temp_dir"
      return 1
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

        if ! clone_repository "$STARTUP_REPO_URL" "$WORKSPACE_DIR"; then
          echo "failed to clone startup repository: $STARTUP_REPO_URL" >&2
          mkdir -p "$WORKSPACE_DIR"
          cat > "$WORKSPACE_DIR/.agentswarm-startup-warning.txt" <<EOF
AgentSwarm could not clone the requested startup repository:
$STARTUP_REPO_URL

The worker was created anyway and opened with an empty workspace at:
$WORKSPACE_DIR

Check container logs and GitHub credentials if this repository should have cloned successfully.
EOF
        fi
      fi
    else
      mkdir -p "$WORKSPACE_DIR"
    fi

    configure_github_auth

    "$BUN_BIN" "$MONITOR_SCRIPT" >/tmp/monitor.log 2>&1 &

    cd "$WORKSPACE_DIR"
    exec code-server \
      --auth none \
      --bind-addr 0.0.0.0:${CODE_SERVER_PORT} \
      --disable-telemetry \
      "$WORKSPACE_DIR"
  '
