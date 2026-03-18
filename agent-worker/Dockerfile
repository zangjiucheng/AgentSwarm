FROM oven/bun:1 AS monitor-builder

WORKDIR /src

COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/monitor/package.json apps/monitor/package.json
COPY apps/monitor/tsconfig.json apps/monitor/tsconfig.json
COPY apps/monitor/src apps/monitor/src

RUN bun install --frozen-lockfile
RUN cd apps/monitor && bun run build

FROM kasmweb/ubuntu-jammy-dind:1.18.0
ARG TARGETARCH
ARG KASMVNC_VERSION="1.3.1"
ARG KASMVNC_SHA256_AMD64=""
ARG KASMVNC_SHA256_ARM64=""

USER kasm-user

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - 
RUN sudo apt-get update && sudo apt-get install -y \
    tmux \
    build-essential \
    git \
    ripgrep \
    nginx \
    nodejs \
    ffmpeg \
    openbox \
    dex \
    xterm

# upstream KasmVNC package for Ubuntu Jammy
RUN if [ "${TARGETARCH}" = "amd64" ]; then \
      KASMVNC_DEB="kasmvncserver_jammy_${KASMVNC_VERSION}_amd64.deb"; \
      KASMVNC_URL="https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/${KASMVNC_DEB}"; \
      KASMVNC_SHA256="${KASMVNC_SHA256_AMD64}"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
      KASMVNC_DEB="kasmvncserver_jammy_${KASMVNC_VERSION}_arm64.deb"; \
      KASMVNC_URL="https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/${KASMVNC_DEB}"; \
      KASMVNC_SHA256="${KASMVNC_SHA256_ARM64}"; \
    else \
      echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; \
      exit 1; \
    fi && \
    wget -O "${KASMVNC_DEB}" "${KASMVNC_URL}" && \
    if [ -n "${KASMVNC_SHA256}" ]; then \
      echo "${KASMVNC_SHA256}  ${KASMVNC_DEB}" | sha256sum -c -; \
    fi && \
    sudo env DEBIAN_FRONTEND=noninteractive dpkg --force-confdef --force-confold -i "${KASMVNC_DEB}" && \
    rm "${KASMVNC_DEB}"

# patched vnc_startup.sh and config to not use ssl
COPY agent-worker/vnc_startup.sh /dockerstartup/vnc_startup.sh
COPY agent-worker/kasmvnc.yaml /etc/kasmvnc/kasmvnc.yaml
COPY --chown=kasm-user:kasm-user agent-worker/kasmvnc.yaml /home/kasm-user/.vnc/kasmvnc.yaml
RUN sudo rm -f /etc/nginx/sites-enabled/default

ENV PATH="/home/kasm-user/.local/bin:$PATH"
ENV NPM_CONFIG_PREFIX=/home/kasm-user/.local

# set default resolution and frame rate, and disable basic auth
ENV VNC_RESOLUTION=1920x1080
ENV MAX_FRAME_RATE=15
ENV VNCOPTIONS="${VNCOPTIONS} -disableBasicAuth"
ENV START_XFCE4=0
ENV START_DE=openbox

# GH CLI
# auth using GITHUB_TOKEN
RUN (type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)) \
    && sudo mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && sudo mkdir -p -m 755 /etc/apt/sources.list.d \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && sudo apt update \
    && sudo apt install gh -y

# OpenAI Codex
RUN npm install -g @openai/codex@latest
COPY --chown=kasm-user:kasm-user agent-worker/dot_codex /home/kasm-user/.codex
COPY --chown=kasm-user:kasm-user agent-worker/dot_agent/skills /home/kasm-user/.codex/skills

# Monitor Daemon
COPY --from=monitor-builder /src/apps/monitor/dist/monitor /opt/monitor/bin/monitor
COPY agent-worker/nginx-monitor.conf /etc/nginx/conf.d/monitor.conf
RUN sudo chmod +x /opt/monitor/bin/monitor
# kasm docker cleans /tmp on startup, we need to wait until the flag disappears
RUN sudo rm -rf /tmp/*
RUN touch /tmp/monitor_flag

# General config
RUN sudo usermod --shell /bin/bash kasm-user
COPY --chown=kasm-user:kasm-user agent-worker/tmux.conf /home/kasm-user/.tmux.conf
COPY --chown=kasm-user:kasm-user agent-worker/bashrc /home/kasm-user/.bashrc
COPY --chown=kasm-user:kasm-user agent-worker/openbox-autostart /home/kasm-user/.config/openbox/autostart
COPY --chown=kasm-user:kasm-user agent-worker/setup.sh /home/kasm-user/setup.sh
RUN mkdir -p /home/kasm-user/Desktop /home/kasm-user/Downloads /home/kasm-user/Uploads /home/kasm-user/workers
RUN rm -f /home/kasm-user/.bash_history
RUN rm -rf /home/kasm-user/.vnc

# orchestrator cli
COPY --chown=kasm-user:kasm-user agent-worker/orchestrator.py /home/kasm-user/orchestrator.py
RUN chmod +x /home/kasm-user/orchestrator.py

ENV CODEX_WORKER=1

# Health check - polls the monitor tRPC health query every 1s
HEALTHCHECK --interval=1s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:51301/monitor/trpc/health > /dev/null || exit 1
