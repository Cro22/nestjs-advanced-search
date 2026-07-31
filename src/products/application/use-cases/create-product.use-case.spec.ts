import { CreateProductUseCase } from '@/products/application/use-cases/create-product.use-case';
import { GENERATION_KEY } from '@/products/application/cache-keys';
import { ProductRepository } from '@/products/domain/ports/product.repository';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { CachePort } from '@/products/domain/ports/cache.port';

describe('CreateProductUseCase', () => {
  let repository: jest.Mocked<ProductRepository>;
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let cache: jest.Mocked<CachePort>;
  let useCase: CreateProductUseCase;

  const command = {
    name: 'Aurora Laptop',
    description: 'A fast laptop',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    price: 999.99,
  };

  beforeEach(() => {
    repository = {
      save: jest.fn(),
      count: jest.fn(),
      findBatch: jest.fn(),
    } as unknown as jest.Mocked<ProductRepository>;
    searchIndex = {
      search: jest.fn(),
      autocomplete: jest.fn(),
      index: jest.fn(),
      bulkIndex: jest.fn(),
      ensureIndex: jest.fn(),
      recreateIndex: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<CachePort>;
    useCase = new CreateProductUseCase(repository, searchIndex, cache);
  });

  it('persists, indexes and bumps the cache generation', async () => {
    const product = await useCase.execute(command);

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(searchIndex.index).toHaveBeenCalledTimes(1);
    expect(cache.incr).toHaveBeenCalledWith(GENERATION_KEY);
    expect(product.name).toBe('Aurora Laptop');
  });

  it('bumps the generation even when indexing fails', async () => {
    searchIndex.index.mockRejectedValue(new Error('cluster down'));

    const product = await useCase.execute(command);

    expect(product).toBeDefined();
    expect(cache.incr).toHaveBeenCalledWith(GENERATION_KEY);
  });

  it('does not index or invalidate when persistence fails', async () => {
    repository.save.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute(command)).rejects.toThrow('db down');
    expect(searchIndex.index).not.toHaveBeenCalled();
    expect(cache.incr).not.toHaveBeenCalled();
  });
});
