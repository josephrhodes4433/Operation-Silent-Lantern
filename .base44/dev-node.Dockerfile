# Sandbox dev image: plain Node runtime + the workspace's pnpm major.
# Source is bind-mounted by docker-compose.base44.yml; nothing from the repo is baked in.
FROM node:24-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
