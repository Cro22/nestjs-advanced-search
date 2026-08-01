import { SearchProductsUseCase } from '@/products/application/use-cases/search-products.use-case';
import { GENERATION_KEY } from '@/products/application/cache-keys';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { CachePort } from '@/products/domain/ports/cache.port';
import {
  ProductSearchCriteria,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';
import { ProductSearchResult } from '@/products/domain/search/search-result';
import { SEARCH_SCHEMA_VERSION } from '@/products/domain/search/search-version';

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
    nextCursor: null,
  };
}

describe('SearchProductsUseCase', () => {
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let cache: jest.Mocked<CachePort>;
  let useCase: SearchProductsUseCase;
  let generation: number | null;
  let cachedResult: ProductSearchResult | null;

  /** Collect the keys the use case actually searched the cache with. */
  function searchKeys(): string[] {
    return cache.get.mock.calls.map(([key]) => key).filter((key) => key.startsWith('search:v'));
  }

  beforeEach(() => {
    generation = null;
    cachedResult = null;
    searchIndex = {
      search: jest.fn(),
      autocomplete: jest.fn(),
      index: jest.fn(),
      bulkIndex: jest.fn(),
      ensureIndex: jest.fn(),
      recreateIndex: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;

    cache = {
      get: jest.fn((key: string) =>
        Promise.resolve(key === GENERATION_KEY ? generation : cachedResult),
      ),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
    } as unknown as jest.Mocked<CachePort>;
    useCase = new SearchProductsUseCase(searchIndex, cache);
  });

  it('queries the search index on a cache miss and stores the result', async () => {
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria());

    expect(searchIndex.search).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('serves from cache without touching the search index on a hit', async () => {
    cachedResult = emptyResult();

    await useCase.execute(baseCriteria());

    expect(searchIndex.search).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('builds versioned, generation scoped, hashed keys', async () => {
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria());

    expect(searchKeys()[0]).toMatch(
      new RegExp(`^search:v${SEARCH_SCHEMA_VERSION}:g0:[0-9a-f]{40}$`),
    );
  });

  it('produces a stable cache key regardless of filter order', async () => {
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria({ filters: { categories: ['A', 'B'] } }));
    await useCase.execute(baseCriteria({ filters: { categories: ['B', 'A'] } }));

    const [firstKey, secondKey] = searchKeys();
    expect(firstKey).toBe(secondKey);
  });

  it('varies the key when the geo filter changes', async () => {
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria());
    await useCase.execute(
      baseCriteria({
        filters: { categories: ['Electronics'], geo: { lat: 40.4, lon: -3.7, radiusKm: 25 } },
      }),
    );

    const [withoutGeo, withGeo] = searchKeys();
    expect(withoutGeo).not.toBe(withGeo);
  });

  it('varies the key when the generation is bumped by a write', async () => {
    searchIndex.search.mockResolvedValue(emptyResult());

    await useCase.execute(baseCriteria());
    generation = 7;
    await useCase.execute(baseCriteria());

    const [before, after] = searchKeys();
    expect(before).toContain(':g0:');
    expect(after).toContain(':g7:');
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
    cachedResult = cached;

    const result = await useCase.execute(baseCriteria());

    expect(result.hits[0].product.createdAt).toBeInstanceOf(Date);
  });
});
