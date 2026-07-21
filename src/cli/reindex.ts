import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { ReindexProductsUseCase } from '@/products/application/use-cases/reindex-products.use-case';

/**
 * Standalone command that rebuilds the Elasticsearch index from Postgres.
 * Usage: npm run search:reindex
 */
async function run(): Promise<void> {
  const logger = new Logger('Reindex');
  const app = await NestFactory.createApplicationContext(AppModule, { logger });

  try {
    const reindex = app.get(ReindexProductsUseCase);
    const result = await reindex.execute();
    logger.log(`Reindex finished. ${result.indexed} products indexed.`);
  } catch (error) {
    logger.error('Reindex failed', error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

run();
