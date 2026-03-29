#!/usr/bin/env bash

set -euo pipefail

WORKER_HOME_DIR="${WORKER_HOME_DIR:-${HOME:-/home/kasm-user}}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$WORKER_HOME_DIR/workers}"
DISPLAY_VALUE="${DISPLAY:-:1}"
COMPUTER_USE_STATE_DIR="$WORKER_HOME_DIR/.agentswarm/computer-use"
COMPUTER_USE_PROFILES_DIR="$WORKER_HOME_DIR/.agentswarm/profiles"
COMPUTER_USE_PROFILE="$COMPUTER_USE_PROFILES_DIR/computer-use"
COMPUTER_USE_DEFAULT_LINK="$COMPUTER_USE_PROFILES_DIR/computer-use-default"
COMPUTER_USE_EXTRA_LINK="$COMPUTER_USE_PROFILES_DIR/computer-use-extra"
COMPUTER_USE_STAMP_FILE="$COMPUTER_USE_STATE_DIR/flake-ref"
DEFAULT_COMPUTER_USE_FLAKE="${WORKER_COMPUTER_USE_FLAKE:-/opt/agent-worker-flake#computerUseEnv}"
EXTRA_COMPUTER_USE_FLAKE="${WORKER_COMPUTER_USE_EXTRA_FLAKE_REF:-}"
LOG_FILE="$COMPUTER_USE_STATE_DIR/provision.log"
ERROR_FILE="$COMPUTER_USE_STATE_DIR/error"
STATUS_FILE="$COMPUTER_USE_STATE_DIR/status"
WORKER_USER="${WORKER_USER:-kasm-user}"
WORKER_UID="${WORKER_UID:-1000}"
WORKER_GID="${WORKER_GID:-1000}"
WORKER_RUN_DESKTOP_AS_ROOT="${WORKER_RUN_DESKTOP_AS_ROOT:-1}"
SETPRIV_BIN="${SETPRIV_BIN:-$(command -v setpriv || true)}"
VNC_PORT="${WORKER_VNC_PORT:-6901}"
VNC_PASSWORD="${WORKER_VNC_PASSWORD:-computer-use}"
VNC_SCREEN="${WORKER_VNC_RESOLUTION:-1440x900x24}"
X11VNC_PORT="${WORKER_X11VNC_PORT:-5900}"
NIX_DAEMON_SOCKET="${NIX_DAEMON_SOCKET:-/nix/var/nix/daemon-socket/socket}"
NIX_BUILD_RETRY_COUNT="${NIX_BUILD_RETRY_COUNT:-5}"
NIX_BUILD_RETRY_DELAY_S="${NIX_BUILD_RETRY_DELAY_S:-3}"
NIX_BUILD_INITIAL_DELAY_S="${NIX_BUILD_INITIAL_DELAY_S:-10}"

mkdir -p "$COMPUTER_USE_STATE_DIR" "$(dirname "$COMPUTER_USE_PROFILE")"
: > "$LOG_FILE"
: > "$ERROR_FILE"
printf 'preparing\n' > "$STATUS_FILE"

exec > >(tee -a "$LOG_FILE") 2>&1

set_status() {
  printf '%s\n' "$1" > "$STATUS_FILE"
}

set_error() {
  printf '%s\n' "$1" > "$ERROR_FILE"
}

clear_error() {
  : > "$ERROR_FILE"
}

fail() {
  local message="$1"

  echo "$message" >&2
  set_error "$message"
  set_status "error"
  exit 1
}

run_as_worker_background() {
  local command_text="$1"
  local log_file="$2"

  if [ "$WORKER_RUN_DESKTOP_AS_ROOT" = "1" ]; then
    env \
      HOME="$WORKER_HOME_DIR" \
      USER="root" \
      WORKSPACE_DIR="$WORKSPACE_DIR" \
      DISPLAY="$DISPLAY_VALUE" \
      PATH="$PATH" \
      bash -lc "$command_text" \
      >"$log_file" 2>&1 &
    return 0
  fi

  if [ "$(id -u)" -eq "$WORKER_UID" ]; then
    env \
      HOME="$WORKER_HOME_DIR" \
      USER="$WORKER_USER" \
      WORKSPACE_DIR="$WORKSPACE_DIR" \
      DISPLAY="$DISPLAY_VALUE" \
      PATH="$PATH" \
      bash -lc "$command_text" \
      >"$log_file" 2>&1 &
    return 0
  fi

  if [ -z "$SETPRIV_BIN" ]; then
    fail "setpriv is required to launch the desktop as ${WORKER_USER}"
  fi

  "$SETPRIV_BIN" \
    --reuid="$WORKER_UID" \
    --regid="$WORKER_GID" \
    --init-groups \
    env \
    HOME="$WORKER_HOME_DIR" \
    USER="$WORKER_USER" \
    WORKSPACE_DIR="$WORKSPACE_DIR" \
    DISPLAY="$DISPLAY_VALUE" \
    PATH="$PATH" \
    bash -lc "$command_text" \
    >"$log_file" 2>&1 &
}

run_as_worker() {
  local command_text="$1"

  if [ "$WORKER_RUN_DESKTOP_AS_ROOT" = "1" ]; then
    env \
      HOME="$WORKER_HOME_DIR" \
      USER="root" \
      WORKSPACE_DIR="$WORKSPACE_DIR" \
      DISPLAY="$DISPLAY_VALUE" \
      PATH="$PATH" \
      bash -lc "$command_text"
    return 0
  fi

  if [ "$(id -u)" -eq "$WORKER_UID" ]; then
    env \
      HOME="$WORKER_HOME_DIR" \
      USER="$WORKER_USER" \
      WORKSPACE_DIR="$WORKSPACE_DIR" \
      DISPLAY="$DISPLAY_VALUE" \
      PATH="$PATH" \
      bash -lc "$command_text"
    return 0
  fi

  if [ -z "$SETPRIV_BIN" ]; then
    fail "setpriv is required to launch the desktop as ${WORKER_USER}"
  fi

  "$SETPRIV_BIN" \
    --reuid="$WORKER_UID" \
    --regid="$WORKER_GID" \
    --init-groups \
    env \
    HOME="$WORKER_HOME_DIR" \
    USER="$WORKER_USER" \
    WORKSPACE_DIR="$WORKSPACE_DIR" \
    DISPLAY="$DISPLAY_VALUE" \
    PATH="$PATH" \
    bash -lc "$command_text"
}

find_novnc_web_root() {
  local candidate=""

  for candidate in \
    "${NOVNC_WEB_ROOT:-}" \
    "$COMPUTER_USE_EXTRA_LINK/share/novnc" \
    "$COMPUTER_USE_EXTRA_LINK/share/webapps/novnc" \
    "$COMPUTER_USE_DEFAULT_LINK/share/novnc" \
    "$COMPUTER_USE_DEFAULT_LINK/share/webapps/novnc" \
    "$COMPUTER_USE_PROFILE/share/novnc" \
    "$COMPUTER_USE_PROFILE/share/webapps/novnc" \
    /opt/novnc \
    /usr/share/novnc \
    /usr/share/webapps/novnc \
    /run/current-system/sw/share/novnc
  do
    if [ -n "$candidate" ] && [ -f "$candidate/vnc.html" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  candidate="$(find /nix/store \( -path '*/share/novnc' -o -path '*/share/webapps/novnc' \) -type d 2>/dev/null | head -n 1)"
  if [ -n "$candidate" ] && [ -f "$candidate/vnc.html" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

wait_for_x_display() {
  local attempt=0

  until xset -display "$DISPLAY_VALUE" q >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
      echo "Timed out waiting for X display $DISPLAY_VALUE" >&2
      return 1
    fi
    sleep 1
  done
}

wait_for_nix_daemon() {
  local attempt=0

  until [ -S "$NIX_DAEMON_SOCKET" ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
      echo "Timed out waiting for Nix daemon socket at $NIX_DAEMON_SOCKET" >&2
      return 1
    fi
    sleep 1
  done

  sleep 3
}

warm_nix_daemon() {
  env -u NIX_REMOTE \
    HOME=/root \
    USER=root \
    nix-store --version >/dev/null 2>&1 || true
  return 0
}

build_flake_with_retry() {
  local out_link="$1"
  local flake_ref="$2"
  local label="$3"
  local attempt=1
  local exit_code=1

  while [ "$attempt" -le "$NIX_BUILD_RETRY_COUNT" ]; do
    echo "Installing ${label} from ${flake_ref} (attempt ${attempt}/${NIX_BUILD_RETRY_COUNT})"
    rm -rf "$out_link"

    if env -u NIX_REMOTE \
      HOME=/root \
      USER=root \
      nix build \
        --accept-flake-config \
        --out-link "$out_link" \
        "$flake_ref"; then
      return 0
    else
      exit_code=$?
    fi

    echo "nix build for ${label} failed with exit code ${exit_code}"

    if [ "$attempt" -lt "$NIX_BUILD_RETRY_COUNT" ]; then
      wait_for_nix_daemon || true
      sleep "$NIX_BUILD_RETRY_DELAY_S"
    fi

    attempt=$((attempt + 1))
  done

  return "$exit_code"
}

launch_terminal() {
  local title="$1"
  local session_name="$2"

  run_as_worker_background "
    if command -v xfce4-terminal >/dev/null 2>&1; then
      exec xfce4-terminal \
        --title='$title' \
        --working-directory='$WORKSPACE_DIR' \
        --command=\"sh -lc 'mkdir -p \\\"$WORKSPACE_DIR\\\"; exec tmux new-session -A -s \\\"$session_name\\\" -c \\\"$WORKSPACE_DIR\\\"'\"
    fi

    exec xterm \
      -title '$title' \
      -fa Monospace \
      -fs 11 \
      -e \"sh -lc 'mkdir -p \\\"$WORKSPACE_DIR\\\"; exec tmux new-session -A -s \\\"$session_name\\\" -c \\\"$WORKSPACE_DIR\\\"'\"
  " "/tmp/${session_name}-terminal.log"
}

launch_browser() {
  run_as_worker_background "
    if command -v chromium >/dev/null 2>&1; then
      exec chromium --no-sandbox --disable-dev-shm-usage about:blank
    fi

    if command -v firefox >/dev/null 2>&1; then
      exec firefox about:blank
    fi

    exit 0
  " /tmp/browser.log
}

start_desktop_session() {
  run_as_worker_background "
    if command -v startxfce4 >/dev/null 2>&1; then
      exec startxfce4
    fi

    exec openbox-session
  " /tmp/desktop-session.log
}

activate_computer_use_profile() {
  local next_path="$PATH"

  next_path="$(append_profile_path "$next_path" "$COMPUTER_USE_DEFAULT_LINK")"
  next_path="$(append_profile_path "$next_path" "$COMPUTER_USE_EXTRA_LINK")"
  next_path="$(append_profile_path "$next_path" "$COMPUTER_USE_PROFILE")"

  export PATH="$next_path"
}

append_profile_path() {
  local current_path="$1"
  local profile_dir="$2"
  local next_path="$current_path"

  if [ -d "$profile_dir/bin" ]; then
    next_path="$profile_dir/bin:$next_path"
  fi

  if [ -d "$profile_dir/sbin" ]; then
    next_path="$profile_dir/sbin:$next_path"
  fi

  printf '%s' "$next_path"
}

prepare_flake_environment() {
  local requested_stamp="${DEFAULT_COMPUTER_USE_FLAKE}|${EXTRA_COMPUTER_USE_FLAKE}"
  local current_stamp=""

  if [ -f "$COMPUTER_USE_STAMP_FILE" ]; then
    current_stamp="$(cat "$COMPUTER_USE_STAMP_FILE")"
  fi

  if [ -d "$COMPUTER_USE_DEFAULT_LINK" ] && [ "$requested_stamp" = "$current_stamp" ]; then
    echo "Reusing existing computer-use profile"
    activate_computer_use_profile
    return 0
  fi

  rm -rf "$COMPUTER_USE_PROFILE" "$COMPUTER_USE_DEFAULT_LINK" "$COMPUTER_USE_EXTRA_LINK"
  mkdir -p "$COMPUTER_USE_PROFILES_DIR"

  export NIX_CONFIG="$(printf '%s\n%s\n' "${NIX_CONFIG:-}" 'filter-syscalls = false')"
  wait_for_nix_daemon || fail "Nix daemon is not ready for computer use mode"
  sleep "$NIX_BUILD_INITIAL_DELAY_S"
  warm_nix_daemon

  build_flake_with_retry \
    "$COMPUTER_USE_DEFAULT_LINK" \
    "$DEFAULT_COMPUTER_USE_FLAKE" \
    "default computer-use environment"

  if [ -n "$EXTRA_COMPUTER_USE_FLAKE" ]; then
    build_flake_with_retry \
      "$COMPUTER_USE_EXTRA_LINK" \
      "$EXTRA_COMPUTER_USE_FLAKE" \
      "extra computer-use environment"
  fi

  ln -sfn "$COMPUTER_USE_DEFAULT_LINK" "$COMPUTER_USE_PROFILE"

  printf '%s\n' "$requested_stamp" > "$COMPUTER_USE_STAMP_FILE"
  chown -R "$WORKER_UID:$WORKER_GID" "$COMPUTER_USE_STATE_DIR" "$COMPUTER_USE_PROFILES_DIR"
  chown -h "$WORKER_UID:$WORKER_GID" "$COMPUTER_USE_PROFILE" 2>/dev/null || true
  chown -h "$WORKER_UID:$WORKER_GID" "$COMPUTER_USE_DEFAULT_LINK" 2>/dev/null || true
  chown -h "$WORKER_UID:$WORKER_GID" "$COMPUTER_USE_EXTRA_LINK" 2>/dev/null || true
  activate_computer_use_profile
}

prepare_flake_environment || fail "Failed to prepare computer use environment"

if ! command -v Xvfb >/dev/null 2>&1; then
  fail "Xvfb is required for computer use mode"
fi

if ! command -v x11vnc >/dev/null 2>&1; then
  fail "x11vnc is required for computer use mode"
fi

if ! command -v websockify >/dev/null 2>&1; then
  fail "websockify is required for computer use mode"
fi

NOVNC_WEB_ROOT="$(find_novnc_web_root)"
if [ -z "$NOVNC_WEB_ROOT" ]; then
  fail "Could not locate noVNC web assets after provisioning"
fi

mkdir -p "$WORKER_HOME_DIR/.vnc" "$WORKER_HOME_DIR/.config/openbox" "$WORKER_HOME_DIR/Desktop" "$WORKER_HOME_DIR/Downloads"
chown -R "$WORKER_UID:$WORKER_GID" "$WORKER_HOME_DIR/.vnc" "$WORKER_HOME_DIR/.config" "$WORKER_HOME_DIR/Desktop" "$WORKER_HOME_DIR/Downloads"

run_as_worker_background "exec Xvfb '$DISPLAY_VALUE' -screen 0 '$VNC_SCREEN' -ac +extension RANDR" /tmp/xvfb.log

wait_for_x_display

export DISPLAY="$DISPLAY_VALUE"

start_desktop_session
run_as_worker "xsetroot -solid '#1f1f1f' >/dev/null 2>&1 || true"

launch_terminal "codex" "codex"
launch_terminal "terminal" "terminal"
launch_browser

run_as_worker "x11vnc -storepasswd '$VNC_PASSWORD' '$WORKER_HOME_DIR/.vnc/passwd' >/dev/null"
run_as_worker_background "
  exec x11vnc \
    -display '$DISPLAY_VALUE' \
    -rfbport '$X11VNC_PORT' \
    -rfbauth '$WORKER_HOME_DIR/.vnc/passwd' \
    -forever \
    -shared \
    -xkb \
    -noxdamage
" /tmp/x11vnc.log

run_as_worker_background "
  exec websockify --web '$NOVNC_WEB_ROOT' '$VNC_PORT' '127.0.0.1:$X11VNC_PORT'
" /tmp/novnc.log

clear_error
set_status "ready"
