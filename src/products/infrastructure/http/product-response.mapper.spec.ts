import { Product, ProductProps } from '@/products/domain/product';
import {
  toProductResponseFromDomain,
  toSearchResponse,
} from '@/products/infrastructure/http/product-response.mapper';
import { ProductSearchResult } from '@/products/domain/search/search-result';

function buildProduct(overrides: Partial<ProductProps> = {}): Product {
  return Product.create({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Aurora',
    description: 'A laptop',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    coordinates: { lat: 40.4, lon: -3.7 },
    price: 100,
    popularity: 5,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('product-response.mapper', () => {
  describe('toProductResponseFromDomain', () => {
    it('maps every field and serializes createdAt to ISO', () => {
      expect(toProductResponseFromDomain(buildProduct())).toEqual({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Aurora',
        description: 'A laptop',
        category: 'Electronics',
        subcategories: ['Laptops'],
        location: 'Madrid',
        coordinates: { lat: 40.4, lon: -3.7 },
        price: 100,
        popularity: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('omits coordinates when the product has none', () => {
      const res = toProductResponseFromDomain(buildProduct({ coordinates: undefined }));
      expect('coordinates' in res).toBe(false);
    });
  });

  describe('toSearchResponse', () => {
    const result: ProductSearchResult = {
      hits: [
        {
          product: buildProduct().toPrimitives(),
          score: 1.5,
          highlights: { name: '<em>Aurora</em>' },
          distanceKm: 12.3,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      facets: { categories: [], subcategories: [], locations: [], price: null },
      suggestions: ['aurora'],
      nextCursor: 'cursor-1',
    };

    it('maps hits with score, highlights and distance, and computes meta', () => {
      const res = toSearchResponse(result);
      expect(res.data[0]).toEqual(
        expect.objectContaining({
          id: '11111111-1111-4111-8111-111111111111',
          score: 1.5,
          highlights: { name: '<em>Aurora</em>' },
          distanceKm: 12.3,
        }),
      );
      expect(res.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        nextCursor: 'cursor-1',
      });
      expect(res.suggestions).toEqual(['aurora']);
    });

    it('reports zero pages for an empty result set', () => {
      expect(toSearchResponse({ ...result, hits: [], total: 0 }).meta.totalPages).toBe(0);
    });
  });
});
