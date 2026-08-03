import fc from 'fast-check';
import { toSearchCriteria } from '@/products/infrastructure/http/search-criteria.mapper';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';
import { InvalidSearchQueryError } from '@/products/domain/search/search.errors';

function query(overrides: Partial<SearchProductsQueryDto>): SearchProductsQueryDto {
  return overrides as SearchProductsQueryDto;
}

describe('toSearchCriteria (property based)', () => {
  it('keeps any valid lat/lon pair as the geo filter', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        (lat, lon) => {
          const criteria = toSearchCriteria(query({ lat, lon }), 100);
          expect(criteria.filters.geo).toEqual({ lat, lon });
        },
      ),
    );
  });

  it('rejects a half-specified coordinate pair', () => {
    fc.assert(
      fc.property(fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }), (lat) => {
        expect(() => toSearchCriteria(query({ lat }), 100)).toThrow(InvalidSearchQueryError);
      }),
    );
  });

  it('carries any price bounds through to the filter', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        (minPrice, maxPrice) => {
          const criteria = toSearchCriteria(query({ minPrice, maxPrice }), 100);
          expect(criteria.filters.price).toEqual({ min: minPrice, max: maxPrice });
        },
      ),
    );
  });

  it('always clamps the page size into [1, maxPageSize]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 1000 }),
        (pageSize, maxPageSize) => {
          const criteria = toSearchCriteria(query({ pageSize }), maxPageSize);
          expect(criteria.pageSize).toBeGreaterThanOrEqual(1);
          expect(criteria.pageSize).toBeLessThanOrEqual(maxPageSize);
        },
      ),
    );
  });
});
