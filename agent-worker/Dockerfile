ARG CODEX_VERSION=0.115.0

FROM oven/bun:1 AS monitor-builder

WORKDIR /app

COPY package.json bun.lock /app/
COPY apps/monitor/package.json /app/apps/monitor/package.json

RUN bun install

COPY apps/monitor /app/apps/monitor

RUN bun build /app/apps/monitor/src/index.ts --outfile=/app/apps/monitor/dist/index.js --target bun --minify
RUN mkdir -p /app/apps/monitor/dist/native \
    && find /app/node_modules -path '*/bun-pty/rust-pty/target/release/librust_pty*.so' -exec cp {} /app/apps/monitor/dist/native/ \;

FROM node:22-bookworm-slim AS codex-installer

ARG CODEX_VERSION

RUN npm install -g --unsafe-perm "@openai/codex@${CODEX_VERSION}"

FROM node:22-bookworm-slim

ARG CODEX_VERSION

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/home/kasm-user
ENV SHELL=/bin/bash
ENV NPM_CONFIG_PREFIX=/home/kasm-user/.local
ENV PATH="/home/kasm-user/.local/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ENV CODEX_VERSION=$CODEX_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      chromium \
      curl \
      dbus-x11 \
      docker.io \
      git \
      gh \
      jq \
      openssh-client \
      openssh-server \
      procps \
      python3 \
      python3-websockify \
      ripgrep \
      scrot \
      sudo \
      tmux \
      util-linux \
      wmctrl \
      x11-utils \
      x11vnc \
      xauth \
      xdotool \
      xterm \
      xvfb \
      xfce4 \
      xfce4-terminal \
      xfce4-panel \
      xfce4-session \
      xfce4-settings \
      xfdesktop4 \
      xfwm4 \
      thunar \
      openbox \
      novnc \
      zsh \
    && HOME=/root NPM_CONFIG_PREFIX=/usr/local npm install -g --unsafe-perm code-server \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 kasm-user \
    && useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash kasm-user \
    && groupadd --gid 1001 docker \
    && usermod -aG docker,sudo kasm-user \
    && printf '%s\n' 'kasm-user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/kasm-user \
    && chmod 440 /etc/sudoers.d/kasm-user

COPY --from=monitor-builder /usr/local/bin/bun /usr/local/bin/bun
COPY --from=monitor-builder /usr/local/bin/bunx /usr/local/bin/bunx
COPY --from=monitor-builder /app/apps/monitor/dist/index.js /usr/local/bin/monitor.js
COPY --from=monitor-builder /app/apps/monitor/dist/native /usr/local/lib/bun-pty
COPY --from=codex-installer /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=codex-installer /usr/local/bin/codex /usr/local/bin/codex

COPY --chown=1000:1000 agent-worker/dot_codex /home/kasm-user/.codex
COPY --chown=1000:1000 agent-worker/dot_agent/skills /home/kasm-user/.codex/skills
COPY --chown=1000:1000 agent-worker/code-server-settings.json /home/kasm-user/.local/share/code-server/User/settings.json
COPY --chown=1000:1000 agent-worker/tmux.conf /home/kasm-user/.tmux.conf
COPY --chown=1000:1000 agent-worker/bashrc /home/kasm-user/.bashrc
COPY --chown=1000:1000 agent-worker/zshrc /home/kasm-user/.zshrc
COPY --chown=1000:1000 agent-worker/setup.sh /home/kasm-user/setup.sh
COPY --chown=1000:1000 configure-github.sh /home/kasm-user/configure-github.sh
COPY --chown=1000:1000 agent-worker/orchestrator.py /home/kasm-user/orchestrator.py
COPY agent-worker/computer-use-start.sh /usr/local/bin/computer-use-start
COPY agent-worker/docker-entrypoint.sh /usr/local/bin/agent-worker-entrypoint

RUN chmod +x \
      /home/kasm-user/configure-github.sh \
      /home/kasm-user/orchestrator.py \
      /usr/local/bin/agent-worker-entrypoint \
      /usr/local/bin/computer-use-start \
    && ln -sf /home/kasm-user/configure-github.sh /usr/local/bin/configure-github \
    && mkdir -p \
      /home/kasm-user/.cache \
      /home/kasm-user/.local/bin \
      /home/kasm-user/.local/share/code-server/User \
      /home/kasm-user/.local/share/code-server/extensions \
      /home/kasm-user/Desktop \
      /home/kasm-user/Downloads \
      /home/kasm-user/Uploads \
      /home/kasm-user/workers \
      /var/run \
      /var/lib/docker \
    && HOME=/home/kasm-user code-server --install-extension vscodevim.vim --extensions-dir /home/kasm-user/.local/share/code-server/extensions --force \
    && chown -R 1000:1000 /home/kasm-user

ENV CODEX_WORKER=1

EXPOSE 51300
EXPOSE 2222
EXPOSE 6901

HEALTHCHECK --interval=2s --timeout=2s --start-period=10s --retries=30 \
  CMD curl -fsS http://127.0.0.1:51300/ > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/agent-worker-entrypoint"]
