import { INestApplication } from '@nestjs/common';
import { ReindexProductsUseCase } from '@/products/application/use-cases/reindex-products.use-case';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { createTestApp } from './create-test-app';
import { resetData } from './fixtures';

describe('reindex content drift (e2e)', () => {
  let app: INestApplication;
  let reindex: ReindexProductsUseCase;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    reindex = app.get(ReindexProductsUseCase);
    prisma = app.get(PrismaService);
    // resetData force rebuilds and stamps the checksum onto the live index.
    await resetData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('skips the rebuild when Postgres and the index still match', async () => {
    const result = await reindex.execute();
    expect(result.skipped).toBe(true);
  });

  it('rebuilds when content drifts in Postgres without a count change', async () => {
    // Mutate a row straight in Postgres, bypassing the write path and its outbox
    // entry, so the document count stays equal while the content diverges.
    const row = await prisma.product.findFirst();
    await prisma.product.update({
      where: { id: row!.id },
      data: { name: `${row!.name} (edited out of band)` },
    });

    const drifted = await reindex.execute();
    expect(drifted.skipped).toBe(false);

    // Once rebuilt and restamped, the projection is in sync again.
    const afterHeal = await reindex.execute();
    expect(afterHeal.skipped).toBe(true);
  });
});
