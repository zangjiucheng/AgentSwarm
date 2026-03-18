FROM nixos/nix:latest

ENV HOME=/home/kasm-user
ENV WORKER_PROFILE=/nix/var/nix/profiles/agentswarm-worker
ENV SHELL=/nix/var/nix/profiles/agentswarm-worker/bin/bash
ENV NPM_CONFIG_PREFIX=/home/kasm-user/.local
ENV PATH="/home/kasm-user/.local/bin:/nix/var/nix/profiles/agentswarm-worker/bin:/nix/var/nix/profiles/agentswarm-worker/sbin:$PATH"
ENV CODEX_VERSION=0.115.0

RUN mkdir -p /etc/nix \
    && printf '%s\n' \
      'experimental-features = nix-command flakes' \
      'build-users-group =' \
      > /etc/nix/nix.conf

COPY agent-worker/flake.nix agent-worker/flake.lock /tmp/agent-worker/

RUN nix profile add --profile "$WORKER_PROFILE" --accept-flake-config /tmp/agent-worker

RUN printf '%s\n' \
      'root:x:0:0:System administrator:/root:/nix/var/nix/profiles/agentswarm-worker/bin/sh' \
      'kasm-user:x:1000:1000:AgentSwarm worker:/home/kasm-user:/nix/var/nix/profiles/agentswarm-worker/bin/bash' \
      > /etc/passwd \
    && printf '%s\n' \
      'root:x:0:' \
      'kasm-user:x:1000:' \
      'docker:x:1001:kasm-user' \
      > /etc/group

RUN mkdir -p "$NPM_CONFIG_PREFIX" \
    && nix --extra-experimental-features "nix-command flakes" shell --accept-flake-config /tmp/agent-worker#nodejs --command \
      npm install -g --unsafe-perm --prefix "$NPM_CONFIG_PREFIX" "@openai/codex@${CODEX_VERSION}" \
    && rm -rf /tmp/agent-worker

COPY --chown=1000:1000 agent-worker/dot_codex /home/kasm-user/.codex
COPY --chown=1000:1000 agent-worker/dot_agent/skills /home/kasm-user/.codex/skills
COPY --chown=1000:1000 agent-worker/code-server-settings.json /home/kasm-user/.local/share/code-server/User/settings.json
COPY --chown=1000:1000 agent-worker/tmux.conf /home/kasm-user/.tmux.conf
COPY --chown=1000:1000 agent-worker/bashrc /home/kasm-user/.bashrc
COPY --chown=1000:1000 agent-worker/setup.sh /home/kasm-user/setup.sh
COPY --chown=1000:1000 agent-worker/orchestrator.py /home/kasm-user/orchestrator.py
COPY agent-worker/docker-entrypoint.sh /usr/local/bin/agent-worker-entrypoint

RUN chmod +x /home/kasm-user/orchestrator.py /usr/local/bin/agent-worker-entrypoint \
    && mkdir -p /home/kasm-user/.local/share/code-server/User /home/kasm-user/Desktop /home/kasm-user/Downloads /home/kasm-user/Uploads /home/kasm-user/workers \
    && chown -R 1000:1000 /home/kasm-user

ENV CODEX_WORKER=1

EXPOSE 51300

HEALTHCHECK --interval=2s --timeout=2s --start-period=10s --retries=30 \
  CMD curl -fsS http://127.0.0.1:51300/ > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/agent-worker-entrypoint"]
