import { SearchProductsUseCase } from '@/products/application/use-cases/search-products.use-case';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { CachePort } from '@/products/domain/ports/cache.port';
import {
  ProductSearchCriteria,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';
import { ProductSearchResult } from '@/products/domain/search/search-result';

function baseCriteria(overrides: Partial<ProductSearchCriteria> = {}): ProductSearchCriteria {
  return {
    text: 'laptop',
    filters: { categories: ['Electronics'] },
    sort: { field: SortField.RELEVANCE, direction: SortDirection.DESC },
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

function emptyResult(): ProductSearchResult {
  return {
    hits: [],
    total: 0,
    page: 1,
    pageSize: 20,
    facets: { categories: [], subcategories: [], locations: [], price: null },
    suggestions: [],
  };
}

describe('SearchProductsUseCase', () => {
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let cache: jest.Mocked<CachePort>;
  let useCase: SearchProductsUseCase;

  beforeEach(() => {
    searchIndex = {
      search: jest.fn(),
      autocomplete: jest.fn(),
      index: jest.fn(),
      bulkIndex: jest.fn(),
      ensureIndex: jest.fn(),
      recreateIndex: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;

    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<CachePort>;
    useCase = new SearchProductsUseCase(searchIndex, cache);
  });

  it('queries the search index on a cache miss and stores the result', async () => {
    cache.get.mockResolvedValue(null);
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria());

    expect(searchIndex.search).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('serves from cache without touching the search index on a hit', async () => {
    cache.get.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria());

    expect(searchIndex.search).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('produces a stable cache key regardless of filter order', async () => {
    cache.get.mockResolvedValue(null);
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria({ filters: { categories: ['A', 'B'] } }));
    await useCase.execute(baseCriteria({ filters: { categories: ['B', 'A'] } }));

    const [firstKey] = cache.get.mock.calls[0];
    const [secondKey] = cache.get.mock.calls[1];
    expect(firstKey).toBe(secondKey);
  });

  it('restores Date objects when reading a result back from the cache', async () => {
    const cached = emptyResult();
    // Dates survive JSON as ISO strings; the use case must rehydrate them.
    cached.hits = [
      {
        product: {
          id: '1',
          name: 'Laptop',
          description: 'A laptop',
          category: 'Electronics',
          subcategories: [],
          location: 'Madrid',
          price: 100,
          popularity: 0,
          createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
        },
        score: 1,
      },
    ];
    cache.get.mockResolvedValue(cached);

    const result = await useCase.execute(baseCriteria());

    expect(result.hits[0].product.createdAt).toBeInstanceOf(Date);
  });
});
