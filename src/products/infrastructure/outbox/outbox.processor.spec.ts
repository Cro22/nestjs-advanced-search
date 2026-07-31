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

function entry(id: string, operation: string, productId = 'p1') {
  return { id, productId, operation, attempts: 0, createdAt: new Date(), processedAt: null };
}

describe('OutboxProcessor', () => {
  let prisma: {
    outboxEntry: { findMany: jest.Mock; update: jest.Mock };
    product: { findUnique: jest.Mock };
  };
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let processor: OutboxProcessor;

  beforeEach(() => {
    prisma = {
      outboxEntry: { findMany: jest.fn(), update: jest.fn() },
      product: { findUnique: jest.fn().mockResolvedValue(productRow) },
    };
    searchIndex = {
      index: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;
    const config = { get: jest.fn().mockReturnValue(5000) } as unknown as ConfigService;
    processor = new OutboxProcessor(prisma as unknown as PrismaService, searchIndex, config);
  });

  it('reindexes upsert entries from the source of truth and marks them processed', async () => {
    prisma.outboxEntry.findMany.mockResolvedValue([entry('o1', OUTBOX_UPSERT)]);

    const processed = await processor.drain();

    expect(processed).toBe(1);
    expect(searchIndex.index).toHaveBeenCalledTimes(1);
    expect(searchIndex.index.mock.calls[0][0].id).toBe('p1');
    expect(prisma.outboxEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      }),
    );
  });

  it('removes documents for delete entries', async () => {
    prisma.outboxEntry.findMany.mockResolvedValue([entry('o1', OUTBOX_DELETE)]);

    await processor.drain();

    expect(searchIndex.remove).toHaveBeenCalledWith('p1');
    expect(searchIndex.index).not.toHaveBeenCalled();
  });

  it('marks an upsert processed when the product no longer exists', async () => {
    prisma.outboxEntry.findMany.mockResolvedValue([entry('o1', OUTBOX_UPSERT)]);
    prisma.product.findUnique.mockResolvedValue(null);

    const processed = await processor.drain();

    expect(processed).toBe(1);
    expect(searchIndex.index).not.toHaveBeenCalled();
  });

  it('keeps a failing entry pending and increments its attempts', async () => {
    prisma.outboxEntry.findMany.mockResolvedValue([
      entry('o1', OUTBOX_UPSERT),
      entry('o2', OUTBOX_DELETE, 'p2'),
    ]);
    searchIndex.index.mockRejectedValue(new Error('es down'));

    const processed = await processor.drain();

    // The failed upsert stays pending; the delete still goes through.
    expect(processed).toBe(1);
    expect(prisma.outboxEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1' },
        data: { attempts: { increment: 1 } },
      }),
    );
    expect(searchIndex.remove).toHaveBeenCalledWith('p2');
  });

  it('never lets the poll run concurrently with itself', async () => {
    let release: () => void = () => undefined;
    prisma.outboxEntry.findMany.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );

    const first = processor.drain();
    const second = await processor.drain();
    expect(second).toBe(0);

    release();
    await first;
  });
});
