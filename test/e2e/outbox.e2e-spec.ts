import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTestApp } from './create-test-app';
import { resetData } from './fixtures';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { OutboxProcessor } from '@/products/infrastructure/outbox/outbox.processor';
import { OUTBOX_UPSERT } from '@/products/infrastructure/outbox/outbox.types';

describe('Outbox processor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // A very long poll interval keeps the app's own background processor from
    // firing during the test, so the two workers we drive by hand are the only
    // ones touching the entries.
    app = await createTestApp({ OUTBOX_POLL_MS: '3600000' });
    prisma = app.get(PrismaService);
    await resetData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('processes every entry exactly once across two concurrent workers', async () => {
    const product = await prisma.product.findFirst();
    if (!product) {
      throw new Error('expected the fixture set to contain at least one product');
    }

    await prisma.outboxEntry.deleteMany({});
    const total = 40;
    await prisma.outboxEntry.createMany({
      data: Array.from({ length: total }, () => ({
        productId: product.id,
        operation: OUTBOX_UPSERT,
      })),
    });

    const searchIndex = app.get<ProductSearchIndex>(PRODUCT_SEARCH_INDEX);
    const config = app.get(ConfigService);
    const workerA = new OutboxProcessor(prisma, searchIndex, config);
    const workerB = new OutboxProcessor(prisma, searchIndex, config);

    const [processedA, processedB] = await Promise.all([workerA.drain(), workerB.drain()]);

    // Between them the two workers processed the whole batch.
    expect(processedA + processedB).toBe(total);

    const entries = await prisma.outboxEntry.findMany({ where: { productId: product.id } });
    expect(entries).toHaveLength(total);
    // Every entry ran to completion...
    expect(entries.every((entry) => entry.processedAt !== null)).toBe(true);
    // ...and each was claimed by exactly one worker: SKIP LOCKED prevents a
    // second worker from grabbing a row already in flight, so attempts stays 1.
    expect(entries.every((entry) => entry.attempts === 1)).toBe(true);
  });
});
