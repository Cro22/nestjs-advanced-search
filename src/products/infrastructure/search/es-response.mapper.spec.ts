import { estypes } from '@elastic/elasticsearch';
import {
  readAutocompleteNames,
  toSearchResult,
} from '@/products/infrastructure/search/es-response.mapper';
import {
  ProductSearchCriteria,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';
import { ProductDocument } from '@/products/infrastructure/search/product-index';
import { decodeCursor } from '@/shared/domain/pagination';

function criteria(overrides: Partial<ProductSearchCriteria> = {}): ProductSearchCriteria {
  return {
    text: 'laptop',
    filters: {},
    sort: { field: SortField.RELEVANCE, direction: SortDirection.DESC },
    page: 1,
    pageSize: 2,
    ...overrides,
  };
}

const doc: ProductDocument = {
  id: '1',
  name: 'Aurora Laptop',
  description: 'A fast laptop',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  coordinates: { lat: 40.4, lon: -3.7 },
  price: 999.99,
  popularity: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function response(
  overrides: Record<string, unknown> = {},
): estypes.SearchResponse<ProductDocument> {
  return {
    hits: {
      total: { value: 1, relation: 'eq' },
      hits: [
        {
          _index: 'products',
          _id: '1',
          _source: doc,
          _score: 2.5,
          sort: [2.5, '1'],
          highlight: { name: ['Aurora <em>Laptop</em>'] },
        },
      ],
    },
    aggregations: {
      categories: { values: { buckets: [{ key: 'Electronics', doc_count: 3 }] } },
      subcategories: { values: { buckets: [] } },
      locations: { values: { buckets: [{ key: 'Madrid', doc_count: 2 }] } },
      price_stats: { values: { count: 3, min: 10, max: 2000, avg: 512.345 } },
    },
    suggest: {
      alternatives: [{ options: [{ text: 'laptop' }, { text: 'laptops' }] }],
    },
    ...overrides,
  } as unknown as estypes.SearchResponse<ProductDocument>;
}

describe('es-response.mapper', () => {
  describe('toSearchResult', () => {
    it('maps hits, score and highlights into the domain result', () => {
      const result = toSearchResult(response(), criteria());
      expect(result.total).toBe(1);
      expect(result.hits[0].score).toBe(2.5);
      expect(result.hits[0].product.id).toBe('1');
      expect(result.hits[0].product.price).toBe(999.99);
      expect(result.hits[0].highlights).toEqual({ name: 'Aurora <em>Laptop</em>' });
    });

    it('reads facets and rounds the price average', () => {
      const result = toSearchResult(response(), criteria());
      expect(result.facets.categories).toEqual([{ value: 'Electronics', count: 3 }]);
      expect(result.facets.locations).toEqual([{ value: 'Madrid', count: 2 }]);
      expect(result.facets.price).toEqual({ min: 10, max: 2000, avg: 512.35 });
    });

    it('drops the original term from suggestions', () => {
      const result = toSearchResult(response(), criteria({ text: 'laptop' }));
      expect(result.suggestions).toEqual(['laptops']);
    });

    it('emits a next cursor only when the page is full', () => {
      // pageSize 1 and one hit -> full page -> cursor present.
      const full = toSearchResult(response(), criteria({ pageSize: 1 }));
      expect(full.nextCursor).not.toBeNull();
      expect(decodeCursor(full.nextCursor as string)).toEqual([2.5, '1']);

      // pageSize 2 and one hit -> short page -> no cursor.
      const short = toSearchResult(response(), criteria({ pageSize: 2 }));
      expect(short.nextCursor).toBeNull();
    });

    it('exposes distance when sorting by distance', () => {
      const withSort = response({
        hits: {
          total: { value: 1 },
          hits: [{ _source: doc, _score: 0, sort: [12.345] }],
        },
      });
      const result = toSearchResult(
        withSort,
        criteria({ sort: { field: SortField.DISTANCE, direction: SortDirection.ASC } }),
      );
      expect(result.hits[0].distanceKm).toBe(12.35);
    });

    it('handles an empty response', () => {
      const empty = {
        hits: { total: { value: 0 }, hits: [] },
      } as unknown as estypes.SearchResponse<ProductDocument>;
      const result = toSearchResult(empty, criteria());
      expect(result.total).toBe(0);
      expect(result.hits).toEqual([]);
      expect(result.facets.price).toBeNull();
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('readAutocompleteNames', () => {
    it('extracts hit names', () => {
      expect(readAutocompleteNames(response())).toEqual(['Aurora Laptop']);
    });

    it('returns an empty list when there are no hits', () => {
      const empty = { hits: { hits: [] } } as unknown as estypes.SearchResponse<ProductDocument>;
      expect(readAutocompleteNames(empty)).toEqual([]);
    });
  });
});
