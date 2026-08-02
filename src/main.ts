import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';

async function bootstrap(): Promise<void> {
  // Buffer until pino takes over so even bootstrap lines are structured.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('apiPrefix', 'api');
  const port = config.get<number>('port', 3000);

  configureApp(app, config);

  // Swagger exposes the full API surface, so it is served only when enabled
  // (default on; turn SWAGGER_ENABLED off in production).
  if (config.get<boolean>('swagger.enabled', true)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Advanced Product Search API')
      .setDescription(
        'Product search with Elasticsearch relevance, Redis backed autocomplete, faceting, filtering, geo search, pagination and sorting.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API key' }, 'api-key')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    logger.log(`Swagger docs at http://localhost:${port}/${apiPrefix}/docs`);
  }

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
