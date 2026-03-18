FROM node:22-bookworm

ARG TARGETARCH
ARG DOCKER_VERSION=28.0.4
ARG GH_VERSION=2.45.0
ARG RIPGREP_VERSION=14.1.1
ARG CODE_SERVER_VERSION=4.111.0
ARG CODEX_VERSION=0.115.0

ENV DEBIAN_FRONTEND=noninteractive
ENV SHELL=/bin/bash
ENV HOME=/home/kasm-user
ENV PATH="/home/kasm-user/.local/bin:$PATH"
ENV NPM_CONFIG_PREFIX=/home/kasm-user/.local

RUN case "$TARGETARCH" in \
      "amd64") DOCKER_ARCH="x86_64"; RG_TARGET="x86_64-unknown-linux-musl"; GH_ARCH="amd64"; CS_ARCH="amd64" ;; \
      "arm64") DOCKER_ARCH="aarch64"; RG_TARGET="aarch64-unknown-linux-gnu"; GH_ARCH="arm64"; CS_ARCH="arm64" ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz" \
      | tar -xz -C /usr/local/bin --strip-components=1 \
        docker/containerd \
        docker/containerd-shim-runc-v2 \
        docker/ctr \
        docker/docker \
        docker/docker-init \
        docker/docker-proxy \
        docker/dockerd \
        docker/runc \
    && mkdir -p /opt \
    && curl -fsSL "https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/code-server-${CODE_SERVER_VERSION}-linux-${CS_ARCH}.tar.gz" \
      | tar -xz -C /opt \
    && ln -sf "/opt/code-server-${CODE_SERVER_VERSION}-linux-${CS_ARCH}/bin/code-server" /usr/local/bin/code-server \
    && curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-${RG_TARGET}.tar.gz" \
      | tar -xz -C /usr/local/bin --strip-components=1 --wildcards "*/rg" \
    && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin --strip-components=2 "gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh"

RUN mkdir -p /tmp/apt-empty \
    && printf '%s\n' \
      'deb [trusted=yes] http://deb.debian.org/debian bookworm main' \
      'deb [trusted=yes] http://deb.debian.org/debian bookworm-updates main' \
      'deb [trusted=yes] http://deb.debian.org/debian-security bookworm-security main' \
      > /tmp/sources.list \
    && apt-get \
      -o Dir::Etc::SourceList=/tmp/sources.list \
      -o Dir::Etc::SourceParts=/tmp/apt-empty \
      update \
      -o Acquire::AllowInsecureRepositories=true \
    && apt-get \
      -o Dir::Etc::SourceList=/tmp/sources.list \
      -o Dir::Etc::SourceParts=/tmp/apt-empty \
      install -y --no-install-recommends \
      iptables \
      tmux \
    && rm -rf /var/lib/apt/lists/* /tmp/sources.list /tmp/apt-empty

RUN useradd -m -s /bin/bash kasm-user \
    && groupadd -f docker \
    && usermod -aG docker kasm-user

RUN npm install -g --unsafe-perm "@openai/codex@${CODEX_VERSION}"

COPY --chown=kasm-user:kasm-user agent-worker/dot_codex /home/kasm-user/.codex
COPY --chown=kasm-user:kasm-user agent-worker/dot_agent/skills /home/kasm-user/.codex/skills
COPY --chown=kasm-user:kasm-user agent-worker/code-server-settings.json /home/kasm-user/.local/share/code-server/User/settings.json
COPY --chown=kasm-user:kasm-user agent-worker/tmux.conf /home/kasm-user/.tmux.conf
COPY --chown=kasm-user:kasm-user agent-worker/bashrc /home/kasm-user/.bashrc
COPY --chown=kasm-user:kasm-user agent-worker/setup.sh /home/kasm-user/setup.sh
COPY --chown=kasm-user:kasm-user agent-worker/orchestrator.py /home/kasm-user/orchestrator.py
COPY agent-worker/docker-entrypoint.sh /usr/local/bin/agent-worker-entrypoint

RUN chmod +x /home/kasm-user/orchestrator.py /usr/local/bin/agent-worker-entrypoint \
    && mkdir -p /home/kasm-user/.local/share/code-server/User /home/kasm-user/Desktop /home/kasm-user/Downloads /home/kasm-user/Uploads /home/kasm-user/workers \
    && chown -R kasm-user:kasm-user /home/kasm-user

ENV CODEX_WORKER=1

EXPOSE 51300

HEALTHCHECK --interval=2s --timeout=2s --start-period=10s --retries=30 \
  CMD curl -fsS http://127.0.0.1:51300/ > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/agent-worker-entrypoint"]
