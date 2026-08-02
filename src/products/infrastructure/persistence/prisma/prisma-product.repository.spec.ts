import { Product } from '@/products/domain/product';
import { OUTBOX_DELETE, OUTBOX_UPSERT } from '@/products/infrastructure/outbox/outbox.types';
import { PrismaProductRepository } from '@/products/infrastructure/persistence/prisma/prisma-product.repository';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const row = {
  id: 'p1',
  name: 'Aurora Laptop',
  description: 'Fast',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  latitude: 40.4,
  longitude: -3.7,
  price: 999.99,
  popularity: 4,
  createdAt,
  updatedAt: createdAt,
};

function product(id = 'p1'): Product {
  return Product.create({
    id,
    name: 'Aurora Laptop',
    description: 'Fast',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    coordinates: { lat: 40.4, lon: -3.7 },
    price: 999.99,
    popularity: 4,
    createdAt,
  });
}

describe('PrismaProductRepository', () => {
  let prisma: {
    product: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    outboxEntry: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let tx: {
    product: { deleteMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    outboxEntry: { create: jest.Mock };
  };
  let repository: PrismaProductRepository;

  beforeEach(() => {
    tx = {
      product: {
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      outboxEntry: { create: jest.fn() },
    };
    prisma = {
      product: {
        upsert: jest.fn().mockResolvedValue(row),
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      outboxEntry: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((operation: unknown) =>
        typeof operation === 'function'
          ? operation(tx)
          : Promise.all(operation as Promise<unknown>[]),
      ),
      $queryRaw: jest.fn(),
    };
    repository = new PrismaProductRepository(prisma as unknown as PrismaService);
  });

  it('saves the product and its outbox entry in one transaction', async () => {
    await repository.save(product());

    expect(prisma.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        create: expect.objectContaining({ latitude: 40.4, longitude: -3.7 }),
      }),
    );
    expect(prisma.outboxEntry.create).toHaveBeenCalledWith({
      data: { productId: 'p1', operation: OUTBOX_UPSERT },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('finds and maps a product, or returns null when absent', async () => {
    prisma.product.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce(null);

    await expect(repository.findById('p1')).resolves.toMatchObject({
      id: 'p1',
      coordinates: { lat: 40.4, lon: -3.7 },
    });
    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('deletes an existing product and records the delete event', async () => {
    tx.product.deleteMany.mockResolvedValue({ count: 1 });

    await expect(repository.delete('p1')).resolves.toBe(true);
    expect(tx.outboxEntry.create).toHaveBeenCalledWith({
      data: { productId: 'p1', operation: OUTBOX_DELETE },
    });
  });

  it('does not enqueue a delete for a missing product', async () => {
    tx.product.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.delete('missing')).resolves.toBe(false);
    expect(tx.outboxEntry.create).not.toHaveBeenCalled();
  });

  it('increments popularity atomically and enqueues a projection update', async () => {
    tx.product.findUnique.mockResolvedValue({ id: 'p1' });
    tx.product.update.mockResolvedValue({ ...row, popularity: 5 });

    await expect(repository.incrementPopularity('p1')).resolves.toMatchObject({
      id: 'p1',
      popularity: 5,
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { popularity: { increment: 1 } },
    });
    expect(tx.outboxEntry.create).toHaveBeenCalledWith({
      data: { productId: 'p1', operation: OUTBOX_UPSERT },
    });
  });

  it('returns null when incrementing a missing product', async () => {
    tx.product.findUnique.mockResolvedValue(null);

    await expect(repository.incrementPopularity('missing')).resolves.toBeNull();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('reports count and content checksum', async () => {
    prisma.product.count.mockResolvedValue(3);
    prisma.$queryRaw.mockResolvedValueOnce([{ checksum: 'abc' }]).mockResolvedValueOnce([]);

    await expect(repository.count()).resolves.toBe(3);
    await expect(repository.contentChecksum()).resolves.toBe('abc');
    await expect(repository.contentChecksum()).resolves.toBe('');
  });

  it('paginates with a cursor and exposes a next cursor only for full pages', async () => {
    prisma.product.findMany
      .mockResolvedValueOnce([row, { ...row, id: 'p2' }])
      .mockResolvedValueOnce([row]);

    await expect(repository.findBatch('previous', 2)).resolves.toMatchObject({
      items: [{ id: 'p1' }, { id: 'p2' }],
      nextCursor: 'p2',
    });
    expect(prisma.product.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cursor: { id: 'previous' }, skip: 1 }),
    );

    await expect(repository.findBatch(null, 2)).resolves.toMatchObject({
      items: [{ id: 'p1' }],
      nextCursor: null,
    });
    expect(prisma.product.findMany).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ cursor: expect.anything() }),
    );
  });
});
