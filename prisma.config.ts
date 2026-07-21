import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration. The datasource connection URL lives here (it is no
 * longer allowed in schema.prisma) and is read from DATABASE_URL, so the CLI
 * (db push, migrate) and the application share one source of truth.
 *
 * We read process.env directly instead of the strict env() helper on purpose:
 * env() throws when the variable is missing, and `prisma generate` runs at
 * Docker build time (no database, no DATABASE_URL) where the URL is not needed.
 * It is always present when db push runs at container start.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
