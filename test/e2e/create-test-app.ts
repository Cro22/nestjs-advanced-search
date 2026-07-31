import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';

/**
 * Compiles the real AppModule and applies the exact production pipeline
 * (prefix, helmet, validation, filters, shutdown hooks) via configureApp, so
 * e2e requests cross the same middleware users do. Env overrides are applied
 * while the module compiles and restored right after init.
 */
export async function createTestApp(
  envOverrides: Record<string, string> = {},
): Promise<INestApplication> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envOverrides)) {
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
