# syntax=docker/dockerfile:1.7

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g bun@1.3
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# The registry binary is reused for `registry garbage-collect` (it is statically linked).
FROM registry:3 AS registry

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    REGISTRY_BIN=/usr/local/bin/registry

COPY --from=registry /bin/registry /usr/local/bin/registry
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Runs as root on purpose: Berth edits the registry's htpasswd file and deletes
# blobs during garbage collection, both owned by the registry container (root).
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
