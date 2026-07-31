import { UpdateProductUseCase } from '@/products/application/use-cases/update-product.use-case';
import { GENERATION_KEY } from '@/products/application/cache-keys';
import { Product } from '@/products/domain/product';
import { ProductNotFoundError } from '@/products/domain/product.errors';
import { ProductRepository } from '@/products/domain/ports/product.repository';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { CachePort } from '@/products/domain/ports/cache.port';

const existing = Product.create({
  id: 'p1',
  name: 'Aurora Laptop',
  description: 'x',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  price: 999.99,
  popularity: 42,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

const command = {
  id: 'p1',
  name: 'Aurora Laptop Pro',
  description: 'renewed',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Barcelona',
  price: 1099.99,
};

describe('UpdateProductUseCase', () => {
  let repository: jest.Mocked<ProductRepository>;
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let cache: jest.Mocked<CachePort>;
  let useCase: UpdateProductUseCase;

  beforeEach(() => {
    repository = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(existing),
      delete: jest.fn(),
      incrementPopularity: jest.fn(),
      count: jest.fn(),
      findBatch: jest.fn(),
    } as unknown as jest.Mocked<ProductRepository>;
    searchIndex = {
      index: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;
    cache = {
      incr: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<CachePort>;
    useCase = new UpdateProductUseCase(repository, searchIndex, cache);
  });

  it('keeps identity, creation date and popularity while replacing the rest', async () => {
    const product = await useCase.execute(command);

    expect(product.id).toBe('p1');
    expect(product.createdAt).toEqual(existing.createdAt);
    expect(product.popularity).toBe(42);
    expect(product.name).toBe('Aurora Laptop Pro');
    expect(product.location).toBe('Barcelona');
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(searchIndex.index).toHaveBeenCalledTimes(1);
    expect(cache.incr).toHaveBeenCalledWith(GENERATION_KEY);
  });

  it('honours an explicit popularity', async () => {
    const product = await useCase.execute({ ...command, popularity: 7 });
    expect(product.popularity).toBe(7);
  });

  it('throws ProductNotFoundError for a missing id', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(cache.incr).not.toHaveBeenCalled();
  });

  it('still succeeds when indexing fails (outbox repairs it)', async () => {
    searchIndex.index.mockRejectedValue(new Error('es down'));

    const product = await useCase.execute(command);

    expect(product.name).toBe('Aurora Laptop Pro');
    expect(cache.incr).toHaveBeenCalledWith(GENERATION_KEY);
  });
});
