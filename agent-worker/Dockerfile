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

FROM nixos/nix:latest

ARG CODEX_VERSION

ENV HOME=/home/kasm-user
ENV WORKER_PROFILE=/nix/var/nix/profiles/agentswarm-worker
ENV SHELL=/nix/var/nix/profiles/agentswarm-worker/bin/zsh
ENV NPM_CONFIG_PREFIX=/home/kasm-user/.local
ENV PATH="/home/kasm-user/.local/bin:/nix/var/nix/profiles/agentswarm-worker/bin:/nix/var/nix/profiles/agentswarm-worker/sbin:$PATH"
ENV CODEX_VERSION=$CODEX_VERSION

RUN mkdir -p /etc/nix \
    && printf '%s\n' \
      'experimental-features = nix-command flakes' \
      'build-users-group =' \
      'trusted-users = root kasm-user' \
      'allowed-users = *' \
      > /etc/nix/nix.conf

COPY agent-worker/flake.nix agent-worker/flake.lock /tmp/agent-worker/

# QEMU-based multi-arch builds in GitHub Actions can reject Nix's seccomp filter setup.
RUN NIX_CONFIG='filter-syscalls = false' \
    nix profile add --profile "$WORKER_PROFILE" --accept-flake-config /tmp/agent-worker

RUN printf '%s\n' \
      'root:x:0:0:System administrator:/root:/nix/var/nix/profiles/agentswarm-worker/bin/sh' \
      'kasm-user:x:1000:1000:AgentSwarm worker:/home/kasm-user:/nix/var/nix/profiles/agentswarm-worker/bin/zsh' \
      > /etc/passwd \
    && printf '%s\n' \
      'root:x:0:' \
      'kasm-user:x:1000:' \
      'docker:x:1001:kasm-user' \
      > /etc/group

RUN mkdir -p /usr/local/bin \
    && ln -sf /root/.nix-profile/bin/nix-daemon /usr/local/bin/nix-daemon

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
COPY --from=codex-installer /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=codex-installer /usr/local/bin/codex /usr/local/bin/codex
COPY --from=monitor-builder /app/apps/monitor/dist/index.js /usr/local/bin/monitor.js
COPY --from=monitor-builder /app/apps/monitor/dist/native /usr/local/lib/bun-pty
COPY agent-worker/docker-entrypoint.sh /usr/local/bin/agent-worker-entrypoint

RUN chmod +x /home/kasm-user/configure-github.sh /home/kasm-user/orchestrator.py /usr/local/bin/agent-worker-entrypoint /usr/local/bin/computer-use-start \
    && ln -sf /home/kasm-user/configure-github.sh /usr/local/bin/configure-github \
    && mkdir -p /home/kasm-user/.cache/nix /home/kasm-user/.local/share/code-server/User /home/kasm-user/.local/share/code-server/extensions /home/kasm-user/Desktop /home/kasm-user/Downloads /home/kasm-user/Uploads /home/kasm-user/workers \
    && HOME=/home/kasm-user code-server --install-extension vscodevim.vim --extensions-dir /home/kasm-user/.local/share/code-server/extensions --force \
    && mkdir -p /opt \
    && novnc_dir="$(find /nix/store \( -path '*/share/novnc' -o -path '*/share/webapps/novnc' \) | head -n 1)" \
    && if [ -n "$novnc_dir" ]; then ln -s "$novnc_dir" /opt/novnc; fi \
    && mkdir -p /nix/store /nix/var/log/nix /nix/var/nix/builds /nix/var/nix/db /nix/var/nix/daemon-socket /nix/var/nix/gcroots /nix/var/nix/profiles /nix/var/nix/temproots \
    && chown -R 1000:1000 /home/kasm-user /etc/nix /nix/var/nix/builds /nix/var/nix/db /nix/var/nix/gcroots /nix/var/nix/profiles /nix/var/nix/temproots /nix/var/log/nix \
    && chown 1000:1000 /nix/store /nix /nix/var /nix/var/nix

ENV CODEX_WORKER=1

EXPOSE 51300
EXPOSE 2222
EXPOSE 6901

HEALTHCHECK --interval=2s --timeout=2s --start-period=10s --retries=30 \
  CMD curl -fsS http://127.0.0.1:51300/ > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/agent-worker-entrypoint"]
