import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AllExceptionsFilter } from '@/shared/infrastructure/http/all-exceptions.filter';

/**
 * Everything an app instance needs besides listening: prefix, security
 * middleware, validation, error shaping and shutdown hooks. Shared between
 * main.ts and the e2e harness so tests exercise the production pipeline.
 */
export function configureApp(app: INestApplication, config: ConfigService): void {
  const apiPrefix = config.get<string>('apiPrefix', 'api');
  const env = config.get<string>('env', 'development');
  const corsOrigins = config.get<string[]>('cors.origins', []);

  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.use(compression());

  // Restrict CORS to configured origins. With none set, development stays
  // permissive for local tooling, but production grants no cross-origin access
  // rather than reflecting every origin.
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins });
  } else if (env !== 'production') {
    app.enableCors();
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Without this, OnModuleDestroy hooks (Prisma disconnect, Redis quit) never
  // run on SIGTERM, which is exactly how a container is stopped.
  app.enableShutdownHooks();
}
