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
import { Product } from '@/products/domain/product';

function sampleProduct(): Product {
  return Product.create({
    id: '1',
    name: 'Aurora Laptop',
    description: 'x',
    category: 'Electronics',
    subcategories: [],
    location: 'Madrid',
    price: 1,
    popularity: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

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
  it('searches through the stable alias', async () => {
    const search = jest.fn().mockResolvedValue(searchResponse());
    const adapter = buildAdapter(search);

    await adapter.search(criteria());

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ index: 'products' }));
  });

  describe('zero downtime rebuild', () => {
    function buildRebuildAdapter() {
      const client = {
        search: jest.fn(),
        bulk: jest.fn().mockResolvedValue({ errors: false, items: [] }),
        indices: {
          create: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
          exists: jest.fn().mockResolvedValue(false),
          existsAlias: jest.fn().mockResolvedValue(true),
          getAlias: jest.fn(),
          getMapping: jest.fn(),
          putMapping: jest.fn().mockResolvedValue({}),
          get: jest.fn().mockResolvedValue({}),
          updateAliases: jest.fn().mockResolvedValue({}),
          putAlias: jest.fn().mockResolvedValue({}),
        },
      };
      const config = { get: jest.fn().mockReturnValue('products') } as unknown as ConfigService;
      return { client, adapter: new EsProductSearchAdapter(client as never, config) };
    }

    it('bulk indexes into the staging index during a rebuild and swaps at the end', async () => {
      const { client, adapter } = buildRebuildAdapter();

      await adapter.startRebuild();
      const staging = client.indices.create.mock.calls[0][0].index as string;
      expect(staging).toMatch(new RegExp(`^products_v${SEARCH_SCHEMA_VERSION}_\\d+$`));

      await adapter.bulkIndex([sampleProduct()]);
      const operations = client.bulk.mock.calls[0][0].operations as Array<
        Record<string, { _index: string }>
      >;
      expect(operations[0].index._index).toBe(staging);

      await adapter.finishRebuild();
      const actions = client.indices.updateAliases.mock.calls[0][0].actions;
      expect(actions).toContainEqual({ add: { index: staging, alias: 'products' } });
      expect(actions).toContainEqual({ remove: { index: 'products_v*', alias: 'products' } });
    });

    it('bulk indexes into the alias when no rebuild is staging', async () => {
      const { client, adapter } = buildRebuildAdapter();

      await adapter.bulkIndex([sampleProduct()]);

      const operations = client.bulk.mock.calls[0][0].operations as Array<
        Record<string, { _index: string }>
      >;
      expect(operations[0].index._index).toBe('products');
    });

    it('stamps the content checksum on the staging index before the swap', async () => {
      const { client, adapter } = buildRebuildAdapter();

      await adapter.startRebuild();
      const staging = client.indices.create.mock.calls[0][0].index as string;
      await adapter.finishRebuild('checksum-123');

      expect(client.indices.putMapping).toHaveBeenCalledWith({
        index: staging,
        _meta: { contentChecksum: 'checksum-123' },
      });
    });

    it('reads the stored checksum from the live index _meta', async () => {
      const { client, adapter } = buildRebuildAdapter();
      client.indices.getMapping.mockResolvedValue({
        [`products_v${SEARCH_SCHEMA_VERSION}_123`]: {
          mappings: { _meta: { contentChecksum: 'stored-xyz' } },
        },
      });

      await expect(adapter.getContentChecksum()).resolves.toBe('stored-xyz');
    });

    it('returns a null checksum when the alias does not exist', async () => {
      const { client, adapter } = buildRebuildAdapter();
      client.indices.existsAlias.mockResolvedValue(false);

      await expect(adapter.getContentChecksum()).resolves.toBeNull();
    });

    it('abortRebuild deletes the staging index and resets state', async () => {
      const { client, adapter } = buildRebuildAdapter();

      await adapter.startRebuild();
      const staging = client.indices.create.mock.calls[0][0].index as string;
      await adapter.abortRebuild();

      expect(client.indices.delete).toHaveBeenCalledWith({ index: staging });
      expect(client.indices.updateAliases).not.toHaveBeenCalled();
    });

    it('reports the schema as current only when the alias resolves to it', async () => {
      const { client, adapter } = buildRebuildAdapter();

      client.indices.getAlias.mockResolvedValue({
        [`products_v${SEARCH_SCHEMA_VERSION}_123`]: {},
      });
      await expect(adapter.isCurrentSchema()).resolves.toBe(true);

      client.indices.getAlias.mockResolvedValue({ products_v1_99: {} });
      await expect(adapter.isCurrentSchema()).resolves.toBe(false);

      client.indices.existsAlias.mockResolvedValue(false);
      await expect(adapter.isCurrentSchema()).resolves.toBe(false);
    });
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
