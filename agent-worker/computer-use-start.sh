#!/usr/bin/env bash

set -euo pipefail

WORKER_HOME_DIR="${WORKER_HOME_DIR:-${HOME:-/home/kasm-user}}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$WORKER_HOME_DIR/workers}"
DISPLAY_VALUE="${DISPLAY:-:1}"
COMPUTER_USE_STATE_DIR="$WORKER_HOME_DIR/.agentswarm/computer-use"
LOG_FILE="$COMPUTER_USE_STATE_DIR/provision.log"
ERROR_FILE="$COMPUTER_USE_STATE_DIR/error"
STATUS_FILE="$COMPUTER_USE_STATE_DIR/status"
WORKER_USER="${WORKER_USER:-kasm-user}"
WORKER_UID="${WORKER_UID:-1000}"
WORKER_GID="${WORKER_GID:-1000}"
SETPRIV_BIN="${SETPRIV_BIN:-$(command -v setpriv || true)}"
VNC_PORT="${WORKER_VNC_PORT:-6901}"
VNC_PASSWORD="${WORKER_VNC_PASSWORD:-computer-use}"
VNC_SCREEN="${WORKER_VNC_RESOLUTION:-1440x900x24}"
X11VNC_PORT="${WORKER_X11VNC_PORT:-5900}"
CHROMIUM_DEBUG_PORT="${WORKER_CHROMIUM_DEBUG_PORT:-9222}"
EXTRA_COMPUTER_USE_SETUP_SCRIPT="${WORKER_COMPUTER_USE_EXTRA_SETUP_SCRIPT:-}"

mkdir -p "$COMPUTER_USE_STATE_DIR"
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

run_as_root() {
  local command_text="$1"

  env \
    HOME="/root" \
    USER="root" \
    WORKSPACE_DIR="$WORKSPACE_DIR" \
    DISPLAY="$DISPLAY_VALUE" \
    PATH="$PATH" \
    bash -lc "$command_text"
}

run_as_worker_background() {
  local command_text="$1"
  local log_file="$2"

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
    /usr/share/novnc \
    /usr/share/webapps/novnc \
    /opt/novnc
  do
    if [ -n "$candidate" ] && [ -f "$candidate/vnc.html" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

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

require_command() {
  local command_name="$1"
  local message="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "$message"
  fi
}

resolve_extra_setup_script() {
  local configured="$1"
  local candidate=""

  if [ -z "$configured" ]; then
    return 1
  fi

  if [[ "$configured" =~ ^https?:// ]]; then
    printf '%s\n' "$configured"
    return 0
  fi

  if [ -f "$configured" ]; then
    printf '%s\n' "$configured"
    return 0
  fi

  candidate="$WORKSPACE_DIR/$configured"
  if [ -f "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate="$WORKER_HOME_DIR/$configured"
  if [ -f "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

run_extra_setup_script() {
  local configured="$1"
  local resolved=""
  local temp_script=""

  if [ -z "$configured" ]; then
    return 0
  fi

  if ! resolved="$(resolve_extra_setup_script "$configured")"; then
    fail "Configured computer-use setup script could not be resolved: $configured"
  fi

  echo "Running extra computer-use setup: $resolved"

  if [[ "$resolved" =~ ^https?:// ]]; then
    temp_script="$(mktemp /tmp/agentswarm-computer-use-setup.XXXXXX.sh)"
    curl -fsSL "$resolved" -o "$temp_script" || fail "Failed to download computer-use setup script: $resolved"
    chmod 700 "$temp_script"
    run_as_root "bash '$temp_script'"
    rm -f "$temp_script"
    return 0
  fi

  run_as_root "bash '$resolved'"
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
    mkdir -p '$WORKER_HOME_DIR/.config/chromium-agentswarm'
    rm -f \
      '$WORKER_HOME_DIR/.config/chromium-agentswarm/SingletonLock' \
      '$WORKER_HOME_DIR/.config/chromium-agentswarm/SingletonSocket' \
      '$WORKER_HOME_DIR/.config/chromium-agentswarm/SingletonCookie'

    if command -v chromium >/dev/null 2>&1; then
      exec chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --new-window \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port='$CHROMIUM_DEBUG_PORT' \
        --user-data-dir='$WORKER_HOME_DIR/.config/chromium-agentswarm' \
        about:blank
    fi

    if command -v firefox-esr >/dev/null 2>&1; then
      exec firefox-esr about:blank
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

prepare_computer_use_environment() {
  require_command Xvfb "Xvfb is required for computer use mode"
  require_command x11vnc "x11vnc is required for computer use mode"
  require_command websockify "websockify is required for computer use mode"
  require_command xset "xset is required for computer use mode"
  require_command xsetroot "xsetroot is required for computer use mode"

  run_extra_setup_script "$EXTRA_COMPUTER_USE_SETUP_SCRIPT"
}

prepare_computer_use_environment || fail "Failed to prepare computer use environment"

NOVNC_WEB_ROOT="$(find_novnc_web_root)"
if [ -z "$NOVNC_WEB_ROOT" ]; then
  fail "Could not locate noVNC web assets after provisioning"
fi

mkdir -p \
  "$WORKER_HOME_DIR/.vnc" \
  "$WORKER_HOME_DIR/.config/openbox" \
  "$WORKER_HOME_DIR/Desktop" \
  "$WORKER_HOME_DIR/Downloads"
chown -R "$WORKER_UID:$WORKER_GID" \
  "$WORKER_HOME_DIR/.vnc" \
  "$WORKER_HOME_DIR/.config" \
  "$WORKER_HOME_DIR/Desktop" \
  "$WORKER_HOME_DIR/Downloads" \
  "$COMPUTER_USE_STATE_DIR"

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
