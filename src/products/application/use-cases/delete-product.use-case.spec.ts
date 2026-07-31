import { DeleteProductUseCase } from '@/products/application/use-cases/delete-product.use-case';
import { GENERATION_KEY } from '@/products/application/cache-keys';
import { ProductNotFoundError } from '@/products/domain/product.errors';
import { ProductRepository } from '@/products/domain/ports/product.repository';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { CachePort } from '@/products/domain/ports/cache.port';

describe('DeleteProductUseCase', () => {
  let repository: jest.Mocked<ProductRepository>;
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let cache: jest.Mocked<CachePort>;
  let useCase: DeleteProductUseCase;

  beforeEach(() => {
    repository = {
      delete: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
      findById: jest.fn(),
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
    useCase = new DeleteProductUseCase(repository, searchIndex, cache);
  });

  it('deletes, invalidates the cache and removes the document', async () => {
    await useCase.execute('p1');

    expect(repository.delete).toHaveBeenCalledWith('p1');
    expect(cache.incr).toHaveBeenCalledWith(GENERATION_KEY);
    expect(searchIndex.remove).toHaveBeenCalledWith('p1');
  });

  it('throws ProductNotFoundError when nothing was deleted', async () => {
    repository.delete.mockResolvedValue(false);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(cache.incr).not.toHaveBeenCalled();
    expect(searchIndex.remove).not.toHaveBeenCalled();
  });

  it('still succeeds when the index removal fails (outbox repairs it)', async () => {
    searchIndex.remove.mockRejectedValue(new Error('es down'));

    await expect(useCase.execute('p1')).resolves.toBeUndefined();
    expect(cache.incr).toHaveBeenCalledWith(GENERATION_KEY);
  });
});
