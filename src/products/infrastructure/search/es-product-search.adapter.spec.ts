import { errors } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { EsProductSearchAdapter } from '@/products/infrastructure/search/es-product-search.adapter';
import {
  ProductSearchCriteria,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';
import {
  InvalidSearchQueryError,
  SearchUnavailableError,
} from '@/products/domain/search/search.errors';
import { SEARCH_SCHEMA_VERSION } from '@/products/domain/search/search-version';

function criteria(overrides: Partial<ProductSearchCriteria> = {}): ProductSearchCriteria {
  return {
    text: 'laptop',
    filters: {},
    sort: { field: SortField.RELEVANCE, direction: SortDirection.DESC },
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

function responseError(statusCode: number): errors.ResponseError {
  return new errors.ResponseError({
    statusCode,
    body: { error: { type: 'search_phase_execution_exception' }, status: statusCode },
    headers: {},
    warnings: null,
    meta: {} as never,
  });
}

const document = {
  id: '1',
  name: 'Aurora Laptop',
  description: 'A fast laptop',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  coordinates: { lat: 40.4168, lon: -3.7038 },
  price: 999.99,
  popularity: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function searchResponse(overrides: Record<string, unknown> = {}) {
  return {
    hits: {
      total: { value: 1 },
      hits: [
        {
          _source: document,
          _score: 2.5,
          highlight: {
            name: ['Aurora <em>Laptop</em>'],
            description: ['A fast <em>laptop</em>'],
          },
        },
      ],
    },
    ...overrides,
  };
}

function buildAdapter(search: jest.Mock) {
  const client = { search } as never;
  const config = { get: jest.fn().mockReturnValue('products') } as unknown as ConfigService;
  return new EsProductSearchAdapter(client, config);
}

describe('EsProductSearchAdapter', () => {
  it('targets the versioned physical index', async () => {
    const search = jest.fn().mockResolvedValue(searchResponse());
    const adapter = buildAdapter(search);

    await adapter.search(criteria());

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ index: `products_v${SEARCH_SCHEMA_VERSION}` }),
    );
  });

  describe('error mapping', () => {
    it('maps a 400 response into InvalidSearchQueryError', async () => {
      const adapter = buildAdapter(jest.fn().mockRejectedValue(responseError(400)));
      await expect(adapter.search(criteria())).rejects.toBeInstanceOf(InvalidSearchQueryError);
    });

    it('maps a 5xx response into SearchUnavailableError', async () => {
      const adapter = buildAdapter(jest.fn().mockRejectedValue(responseError(503)));
      await expect(adapter.search(criteria())).rejects.toBeInstanceOf(SearchUnavailableError);
    });

    it('maps connectivity failures into SearchUnavailableError', async () => {
      const adapter = buildAdapter(jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
      await expect(adapter.search(criteria())).rejects.toBeInstanceOf(SearchUnavailableError);
    });

    it('applies the same mapping to autocomplete', async () => {
      const adapter = buildAdapter(jest.fn().mockRejectedValue(responseError(400)));
      await expect(adapter.autocomplete('lap', 5)).rejects.toBeInstanceOf(InvalidSearchQueryError);
    });
  });

  describe('hit enrichment', () => {
    it('exposes highlights and the document coordinates', async () => {
      const adapter = buildAdapter(jest.fn().mockResolvedValue(searchResponse()));

      const result = await adapter.search(criteria());

      expect(result.hits[0].highlights).toEqual({
        name: 'Aurora <em>Laptop</em>',
        description: 'A fast <em>laptop</em>',
      });
      expect(result.hits[0].product.coordinates).toEqual({ lat: 40.4168, lon: -3.7038 });
      expect(result.hits[0].distanceKm).toBeUndefined();
    });

    it('omits highlights when the engine returned none', async () => {
      const response = searchResponse();
      delete (response.hits.hits[0] as Record<string, unknown>).highlight;
      const adapter = buildAdapter(jest.fn().mockResolvedValue(response));

      const result = await adapter.search(criteria());
      expect(result.hits[0].highlights).toBeUndefined();
    });

    it('reads the distance from the sort values when sorting by distance', async () => {
      const response = searchResponse();
      (response.hits.hits[0] as Record<string, unknown>).sort = [3.14159, 2.5];
      const adapter = buildAdapter(jest.fn().mockResolvedValue(response));

      const result = await adapter.search(
        criteria({
          filters: { geo: { lat: 40.4168, lon: -3.7038 } },
          sort: { field: SortField.DISTANCE, direction: SortDirection.ASC },
        }),
      );
      expect(result.hits[0].distanceKm).toBe(3.14);
    });

    it('leaves the distance undefined for documents without coordinates', async () => {
      const response = searchResponse();
      (response.hits.hits[0] as Record<string, unknown>).sort = ['Infinity'];
      const adapter = buildAdapter(jest.fn().mockResolvedValue(response));

      const result = await adapter.search(
        criteria({
          filters: { geo: { lat: 40.4168, lon: -3.7038 } },
          sort: { field: SortField.DISTANCE, direction: SortDirection.ASC },
        }),
      );
      expect(result.hits[0].distanceKm).toBeUndefined();
    });
  });
});
