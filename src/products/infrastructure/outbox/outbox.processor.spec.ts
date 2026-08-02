import { ConfigService } from '@nestjs/config';
import { OutboxProcessor } from '@/products/infrastructure/outbox/outbox.processor';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { OUTBOX_DELETE, OUTBOX_UPSERT } from '@/products/infrastructure/outbox/outbox.types';

const productRow = {
  id: 'p1',
  name: 'Aurora Laptop',
  description: 'x',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  latitude: null,
  longitude: null,
  price: 10,
  popularity: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** A row as it comes back from claimBatch: attempts already incremented. */
function claimed(id: string, operation: string, attempts = 1, productId = 'p1') {
  return { id, productId, operation, attempts };
}

describe('OutboxProcessor', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    outboxEntry: { update: jest.Mock; count: jest.Mock };
    product: { findUnique: jest.Mock };
  };
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let processor: OutboxProcessor;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(0),
      outboxEntry: { update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      product: { findUnique: jest.fn().mockResolvedValue(productRow) },
    };
    searchIndex = {
      index: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;
    // Return each config value's own default (the second argument).
    const config = {
      get: jest.fn((_key: string, def: unknown) => def),
    } as unknown as ConfigService;
    processor = new OutboxProcessor(prisma as unknown as PrismaService, searchIndex, config);
  });

  it('reindexes upsert entries from the source of truth and marks them processed', async () => {
    prisma.$queryRaw.mockResolvedValue([claimed('o1', OUTBOX_UPSERT)]);

    const processed = await processor.drain();

    expect(processed).toBe(1);
    expect(searchIndex.index).toHaveBeenCalledTimes(1);
    expect(searchIndex.index.mock.calls[0][0].id).toBe('p1');
    expect(prisma.outboxEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({ processedAt: expect.any(Date), nextRetryAt: null }),
      }),
    );
  });

  it('removes documents for delete entries', async () => {
    prisma.$queryRaw.mockResolvedValue([claimed('o1', OUTBOX_DELETE)]);

    await processor.drain();

    expect(searchIndex.remove).toHaveBeenCalledWith('p1');
    expect(searchIndex.index).not.toHaveBeenCalled();
  });

  it('marks an upsert processed when the product no longer exists', async () => {
    prisma.$queryRaw.mockResolvedValue([claimed('o1', OUTBOX_UPSERT)]);
    prisma.product.findUnique.mockResolvedValue(null);

    const processed = await processor.drain();

    expect(processed).toBe(1);
    expect(searchIndex.index).not.toHaveBeenCalled();
  });

  it('backs off a failing entry instead of dead-lettering it while attempts remain', async () => {
    prisma.$queryRaw.mockResolvedValue([
      claimed('o1', OUTBOX_UPSERT),
      claimed('o2', OUTBOX_DELETE, 1, 'p2'),
    ]);
    searchIndex.index.mockRejectedValue(new Error('es down'));

    const processed = await processor.drain();

    // The failed upsert is rescheduled; the delete still goes through.
    expect(processed).toBe(1);
    expect(searchIndex.remove).toHaveBeenCalledWith('p2');

    const o1Update = prisma.outboxEntry.update.mock.calls.find((c) => c[0].where.id === 'o1');
    expect(o1Update?.[0].data).toEqual(
      expect.objectContaining({ nextRetryAt: expect.any(Date), lastError: 'es down' }),
    );
    expect(o1Update?.[0].data.failedAt).toBeUndefined();
  });

  it('dead-letters an entry once it exhausts its attempts', async () => {
    // attempts already at the default max (10) after the claim increment.
    prisma.$queryRaw.mockResolvedValue([claimed('o1', OUTBOX_UPSERT, 10)]);
    searchIndex.index.mockRejectedValue(new Error('still down'));

    const processed = await processor.drain();

    expect(processed).toBe(0);
    const o1Update = prisma.outboxEntry.update.mock.calls.find((c) => c[0].where.id === 'o1');
    expect(o1Update?.[0].data).toEqual(
      expect.objectContaining({ failedAt: expect.any(Date), lastError: 'still down' }),
    );
  });

  it('never lets the poll run concurrently with itself', async () => {
    let release: () => void = () => undefined;
    prisma.$queryRaw.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );

    const first = processor.drain();
    const second = await processor.drain();
    expect(second).toBe(0);

    release();
    await first;
  });
});
