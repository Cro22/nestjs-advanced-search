import { AutocompleteUseCase } from '@/products/application/use-cases/autocomplete.use-case';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { CachePort } from '@/products/domain/ports/cache.port';

describe('AutocompleteUseCase', () => {
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let cache: jest.Mocked<CachePort>;
  let useCase: AutocompleteUseCase;

  beforeEach(() => {
    searchIndex = {
      autocomplete: jest.fn(),
      search: jest.fn(),
      index: jest.fn(),
      bulkIndex: jest.fn(),
      ensureIndex: jest.fn(),
      recreateIndex: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<CachePort>;
    useCase = new AutocompleteUseCase(searchIndex, cache);
  });

  it('short circuits on an empty prefix without hitting the index', async () => {
    const result = await useCase.execute({ prefix: '   ', limit: 5 });

    expect(result).toEqual([]);
    expect(cache.get).not.toHaveBeenCalled();
    expect(searchIndex.autocomplete).not.toHaveBeenCalled();
  });

  it('normalizes the prefix and caches the suggestions on a miss', async () => {
    cache.get.mockResolvedValue(null);
    searchIndex.autocomplete.mockResolvedValue(['Laptop', 'Laptop stand']);

    const result = await useCase.execute({ prefix: '  LapTop ', limit: 5 });

    expect(searchIndex.autocomplete).toHaveBeenCalledWith('laptop', 5);
    expect(cache.set).toHaveBeenCalledWith('autocomplete:5:laptop', result, expect.any(Number));
    expect(result).toEqual(['Laptop', 'Laptop stand']);
  });

  it('returns cached suggestions without querying the index', async () => {
    cache.get.mockResolvedValue(['Cached']);

    const result = await useCase.execute({ prefix: 'lap', limit: 5 });

    expect(result).toEqual(['Cached']);
    expect(searchIndex.autocomplete).not.toHaveBeenCalled();
  });
});
