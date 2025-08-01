ARG VARIANT="ubuntu-22.04"
FROM mcr.microsoft.com/devcontainers/base:${VARIANT}

# Set environment variables for locale
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Shell for build commands
SHELL ["/bin/bash", "-c"]

# Fix for Docker Desktop proxy issues on macOS/Apple Silicon
RUN printf '%s\n' \
    'Acquire::http::Pipeline-Depth "0";' \
    'Acquire::http::No-Cache "true";' \
    'Acquire::BrokenProxy "true";' \
    > /etc/apt/apt.conf.d/99fixbadproxy

# Build arguments for language versions
ARG NODE_VERSION="18"
ARG NVM_VERSION="0.40.3"
ARG PYTHON_VERSION=""
ARG GO_VERSION=""
ARG RUST_VERSION=""
ARG JAVA_VERSION=""
ARG RUBY_VERSION=""
ARG PG_VERSION=""
ARG REDIS_VERSION=""

# Build arguments for tools
ARG ENABLE_DOCKER="false"
ARG ENABLE_KUBERNETES="false"
ARG ENABLE_AWS_CLI="false"
ARG ENABLE_AZURE_CLI="false"
ARG ENABLE_GCP_CLI="false"
ARG ENABLE_FIREBASE="false"
ARG ENABLE_TIGERVNC="false"
ARG ENABLE_PLAYWRIGHT="false"

# Common dependencies
USER root
RUN apt-get clean -y >/dev/null && rm -rf /var/lib/apt/lists/* \
    && apt-get update -qq \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -yqq --no-install-recommends \
        curl wget git vim \
        build-essential make cmake \
        libssl-dev zlib1g-dev libbz2-dev \
        libreadline-dev libsqlite3-dev llvm \
        libncurses5-dev libncursesw5-dev \
        xz-utils tk-dev libffi-dev liblzma-dev \
        python3-openssl apt-transport-https \
        ca-certificates gnupg lsb-release \
        jq zip unzip tree htop tmux \
        ripgrep fd-find bat git-flow >/dev/null

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg status=none \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
    && apt-get update -qq \
    && apt-get install -yqq gh >/dev/null

# Install nvm, Node.js, and npm
ARG NVM_VERSION="0.40.3"
RUN if [ -n "${NODE_VERSION}" ]; then \
        su vscode -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | bash" \
        && su vscode -c "source ~/.nvm/nvm.sh && nvm install ${NODE_VERSION} && nvm alias default ${NODE_VERSION} && nvm use default && npm i -g -qq pm2" ; \
    fi

# Clean up
RUN apt-get autoremove -yqq >/dev/null && apt-get clean -yqq >/dev/null \
    && rm -rf /var/lib/apt/lists/*

# Switch to vscode user
USER vscode

# Set up environment paths
ENV NVM_DIR="/home/vscode/.nvm"
ENV PATH="${NVM_DIR}/versions/node/v${NODE_VERSION}/bin:${PATH}"

# Set working directory
WORKDIR /workspaces

# Verify installations (build time check)
RUN if [ -n "${NODE_VERSION}" ]; then \
        bash -c "source ~/.nvm/nvm.sh && node --version && npm --version"; \
    fi