#!/bin/sh
set -e

echo "Syncing database schema..."
npx prisma db push

echo "Seeding products (skipped if already populated)..."
node dist/prisma/seed.js

echo "Ensuring Elasticsearch is in sync with Postgres (reindex only if needed)..."
node dist/src/cli/reindex.js

echo "Starting API..."
exec node dist/src/main.js
