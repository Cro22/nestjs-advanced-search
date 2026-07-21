# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# The Prisma schema engine (used by db push) still needs OpenSSL on Alpine.
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

# The Prisma schema engine (used by db push) still needs OpenSSL on Alpine.
# The query engine is gone in Prisma 7 because the pg driver adapter replaces it.
RUN apk add --no-cache openssl

# Only production dependencies in the final image.
COPY package*.json ./
RUN npm ci --omit=dev

# Generate the Prisma client against the production node_modules.
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# Compiled output from the build stage.
COPY --from=builder /app/dist ./dist

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
