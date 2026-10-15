FROM node:22-bookworm-slim
ARG CODEX_VERSION
RUN test -n "$CODEX_VERSION" || (echo 'Set CODEX_VERSION to a verified Codex release' >&2; exit 1)
RUN npm install --global "@openai/codex@${CODEX_VERSION}"
RUN mkdir -p /home/node/.codex /data && chown -R node:node /home/node/.codex /data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node . .
USER node
ENV CODEX_HOME=/home/node/.codex
