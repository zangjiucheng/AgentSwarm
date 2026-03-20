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

append_unique_path_dir() {
  local current_path="$1"
  local next_dir="$2"

  if [ -z "$next_dir" ] || [ ! -d "$next_dir" ]; then
    printf '%s' "$current_path"
    return 0
  fi

  case ":$current_path:" in
    *":$next_dir:"*)
      printf '%s' "$current_path"
      ;;
    *)
      if [ -n "$current_path" ]; then
        printf '%s:%s' "$current_path" "$next_dir"
      else
        printf '%s' "$next_dir"
      fi
      ;;
  esac
}

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

setup_vscode_remote_ssh_compat() {
  local ldconfig_bin=""
  local gpp_bin=""
  local gpp_root=""
  local dynamic_linker_file=""
  local dynamic_linker=""
  local dynamic_linker_name=""
  local libstdcpp_path=""
  local libgcc_path=""
  local library_path=""
  local managed_env_file="$HOME_DIR/.agentswarm-shell-env"
  local zshenv_file="$HOME_DIR/.zshenv"
  local vscode_env_dir="$HOME_DIR/.vscode-server"
  local vscode_env_file="$vscode_env_dir/server-env-setup"
  local source_line="[ -f \"$managed_env_file\" ] && . \"$managed_env_file\""

  if command -v ldconfig >/dev/null 2>&1; then
    ldconfig_bin="$(readlink -f "$(command -v ldconfig)")"
    mkdir -p /usr/sbin /sbin
    ln -sf "$ldconfig_bin" /usr/sbin/ldconfig
    ln -sf "$ldconfig_bin" /sbin/ldconfig
  fi

  if command -v g++ >/dev/null 2>&1; then
    gpp_bin="$(readlink -f "$(command -v g++)")"
    gpp_root="${gpp_bin%/bin/g++}"
    dynamic_linker_file="$gpp_root/nix-support/dynamic-linker"

    if [ -f "$dynamic_linker_file" ]; then
      dynamic_linker="$(cat "$dynamic_linker_file")"
    fi

    libstdcpp_path="$(g++ -print-file-name=libstdc++.so.6 2>/dev/null || true)"
    libgcc_path="$(g++ -print-file-name=libgcc_s.so.1 2>/dev/null || true)"
  fi

  if [ -n "$dynamic_linker" ] && [ -f "$dynamic_linker" ]; then
    dynamic_linker_name="$(basename "$dynamic_linker")"
    mkdir -p /lib /lib64
    ln -sf "$dynamic_linker" "/lib/$dynamic_linker_name"
    ln -sf "$dynamic_linker" "/lib64/$dynamic_linker_name"
    library_path="$(append_unique_path_dir "$library_path" "$(dirname "$dynamic_linker")")"
  fi

  if [ -n "$libstdcpp_path" ] && [ -f "$libstdcpp_path" ]; then
    mkdir -p /usr/lib /usr/lib64
    ln -sf "$libstdcpp_path" "/usr/lib/$(basename "$libstdcpp_path")"
    ln -sf "$libstdcpp_path" "/usr/lib64/$(basename "$libstdcpp_path")"
    library_path="$(append_unique_path_dir "$library_path" "$(dirname "$libstdcpp_path")")"
  fi

  if [ -n "$libgcc_path" ] && [ -f "$libgcc_path" ]; then
    mkdir -p /usr/lib /usr/lib64
    ln -sf "$libgcc_path" "/usr/lib/$(basename "$libgcc_path")"
    ln -sf "$libgcc_path" "/usr/lib64/$(basename "$libgcc_path")"
    library_path="$(append_unique_path_dir "$library_path" "$(dirname "$libgcc_path")")"
  fi

  mkdir -p "$vscode_env_dir"

  {
    printf '# Generated by agent-worker-entrypoint for VS Code Remote-SSH.\n'

    if [ -n "$dynamic_linker" ] && [ -f "$dynamic_linker" ]; then
      printf 'export NIX_LD=%q\n' "$dynamic_linker"
    fi

    if [ -n "$library_path" ]; then
      printf 'export NIX_LD_LIBRARY_PATH=%q\n' "$library_path"
      printf 'if [ -n "${LD_LIBRARY_PATH:-}" ]; then\n'
      printf '  export LD_LIBRARY_PATH=%q:"${LD_LIBRARY_PATH}"\n' "$library_path"
      printf 'else\n'
      printf '  export LD_LIBRARY_PATH=%q\n' "$library_path"
      printf 'fi\n'
    fi
  } > "$managed_env_file"

  chmod 600 "$managed_env_file"
  chown 1000:1000 "$managed_env_file"

  touch "$zshenv_file"
  if ! grep -Fqx "$source_line" "$zshenv_file"; then
    printf '\n%s\n' "$source_line" >> "$zshenv_file"
  fi
  chmod 644 "$zshenv_file"
  chown 1000:1000 "$zshenv_file"

  {
    printf '#!/usr/bin/env bash\n'
    printf 'set -eu\n'
    printf '%s\n' "$source_line"
    printf '\n'
    printf '# Patch downloaded VS Code server binaries into the active Nix runtime.\n'
    printf 'if command -v patchelf >/dev/null 2>&1 && [ -n "${NIX_LD:-}" ] && [ -n "${NIX_LD_LIBRARY_PATH:-}" ]; then\n'
    printf '  for node_path in "$HOME/.vscode-server/bin/"*/node "$HOME/.vscode-server/cli/servers/"*/server/node; do\n'
    printf '    [ -f "$node_path" ] || continue\n'
    printf '    current_interpreter="$(patchelf --print-interpreter "$node_path" 2>/dev/null || true)"\n'
    printf '    current_rpath="$(patchelf --print-rpath "$node_path" 2>/dev/null || true)"\n'
    printf '    if [ "$current_interpreter" = "$NIX_LD" ] && [ "$current_rpath" = "$NIX_LD_LIBRARY_PATH" ]; then\n'
    printf '      continue\n'
    printf '    fi\n'
    printf '    patchelf --set-interpreter "$NIX_LD" --set-rpath "$NIX_LD_LIBRARY_PATH" "$node_path" >/dev/null 2>&1 || true\n'
    printf '  done\n'
    printf 'fi\n'
  } > "$vscode_env_file"

  chmod 700 "$vscode_env_file"
  chown -R 1000:1000 "$vscode_env_dir"
}

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

  local user_shell=""
  user_shell="$(grep '^kasm-user:' /etc/passwd | cut -d: -f7 || true)"
  touch /etc/shells
  chmod 644 /etc/shells

  if [ -n "$user_shell" ] && ! grep -Fxq "$user_shell" /etc/shells; then
    printf '%s\n' "$user_shell" >> /etc/shells
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

setup_vscode_remote_ssh_compat
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
