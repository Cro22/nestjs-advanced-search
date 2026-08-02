import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';

/** API keys the e2e suite uses to exercise protected routes. */
export const E2E_ADMIN_KEY = 'e2e-admin-key';
export const E2E_INGEST_KEY = 'e2e-ingest-key';

/**
 * Compiles the real AppModule and applies the exact production pipeline
 * (prefix, helmet, validation, filters, shutdown hooks) via configureApp, so
 * e2e requests cross the same middleware users do. Env overrides are applied
 * while the module compiles and restored right after init.
 */
export async function createTestApp(
  envOverrides: Record<string, string> = {},
): Promise<INestApplication> {
  // Every test app namespaces its throttle counters so suites sharing the one
  // Redis container never inherit each other's rate limit budgets. A caller can
  // still pin THROTTLE_KEY_PREFIX explicitly to observe shared behaviour.
  const overrides = {
    THROTTLE_KEY_PREFIX: `test:${randomUUID()}`,
    API_KEYS: `${E2E_ADMIN_KEY}:admin,${E2E_INGEST_KEY}:ingest`,
    ...envOverrides,
  };

  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, app.get(ConfigService));
    await app.init();
    return app;
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
