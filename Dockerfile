# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# The Prisma schema engine (used by migrate deploy) still needs OpenSSL on Alpine.
# The query engine is gone in Prisma 7 because the pg driver adapter replaces it.
RUN apk add --no-cache openssl

# Install all dependencies (including dev) for the build.
COPY package*.json ./
RUN npm ci

# Prisma client must be generated before the TypeScript build (seed imports it).
COPY tsconfig*.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# --- Runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The Prisma schema engine (used by migrate deploy) still needs OpenSSL on Alpine.
# The query engine is gone in Prisma 7 because the pg driver adapter replaces it.
RUN apk add --no-cache openssl

# Only production dependencies in the final image.
COPY package*.json ./
RUN npm ci --omit=dev

# Generate the Prisma client against the production node_modules.
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
RUN npx prisma generate

# Compiled output from the build stage.
COPY --from=builder --chown=node:node /app/dist ./dist

COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Drop root: the app only reads /app and talks to the network.
USER node

EXPOSE 3000

# start-period covers the entrypoint bootstrap (migrate deploy, seed backfill and a
# full reindex after a schema version bump). Adjust the URL if PORT or
# API_PREFIX change.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
