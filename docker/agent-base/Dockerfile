# LACC Agent Base Image
# Using node:20-slim as base (ghcr.io/anthropics/claude-code-devcontainer:latest does not exist)
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    openssh-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install useful dev tools
RUN npm install -g tsx prettier

# Create workspace directory
RUN mkdir -p /workspace && chown node:node /workspace

# Switch to node user for security
USER node

WORKDIR /workspace

# Verify claude is installed
RUN claude --version

CMD ["bash"]
