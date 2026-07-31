import { toSearchCriteria } from '@/products/infrastructure/http/search-criteria.mapper';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';
import { SortDirection, SortField } from '@/products/domain/search/search-criteria';
import { InvalidSearchQueryError } from '@/products/domain/search/search.errors';

const MAX_PAGE_SIZE = 100;

function map(dto: Partial<SearchProductsQueryDto>) {
  return toSearchCriteria(dto as SearchProductsQueryDto, MAX_PAGE_SIZE);
}

describe('toSearchCriteria', () => {
  it('trims free text and drops it when empty', () => {
    expect(map({ q: '  laptop  ' }).text).toBe('laptop');
    expect(map({ q: '   ' }).text).toBeUndefined();
    expect(map({}).text).toBeUndefined();
  });

  it('maps filters straight through', () => {
    const criteria = map({
      categories: ['Electronics'],
      subcategories: ['Laptops'],
      locations: ['Madrid'],
    });

    expect(criteria.filters.categories).toEqual(['Electronics']);
    expect(criteria.filters.subcategories).toEqual(['Laptops']);
    expect(criteria.filters.locations).toEqual(['Madrid']);
  });

  it('builds a price range only when a bound is present', () => {
    expect(map({ minPrice: 10, maxPrice: 100 }).filters.price).toEqual({ min: 10, max: 100 });
    expect(map({ minPrice: 10 }).filters.price).toEqual({ min: 10, max: undefined });
    expect(map({}).filters.price).toBeUndefined();
  });

  it('defaults sorting to relevance descending', () => {
    const sort = map({}).sort;
    expect(sort.field).toBe(SortField.RELEVANCE);
    expect(sort.direction).toBe(SortDirection.DESC);
  });

  it('honours an explicit sort field and order', () => {
    const sort = map({ sort: SortField.CREATED_AT, order: SortDirection.ASC }).sort;
    expect(sort.field).toBe(SortField.CREATED_AT);
    expect(sort.direction).toBe(SortDirection.ASC);
  });

  it('normalizes pagination and clamps page size to the configured max', () => {
    expect(map({ page: 0 }).page).toBe(1);
    expect(map({}).page).toBe(1);
    expect(map({ pageSize: 5000 }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(map({}).pageSize).toBe(20);
  });

  describe('geo parameters', () => {
    it('builds the geo filter when lat and lon are present', () => {
      const criteria = map({ lat: 40.4168, lon: -3.7038, radiusKm: 25 });
      expect(criteria.filters.geo).toEqual({ lat: 40.4168, lon: -3.7038, radiusKm: 25 });
    });

    it('accepts an origin without radius (used for distance sorting)', () => {
      const criteria = map({ lat: 40.4168, lon: -3.7038 });
      expect(criteria.filters.geo).toEqual({ lat: 40.4168, lon: -3.7038 });
    });

    it('rejects lat without lon and lon without lat', () => {
      expect(() => map({ lat: 40.4168 })).toThrow(InvalidSearchQueryError);
      expect(() => map({ lon: -3.7038 })).toThrow(InvalidSearchQueryError);
    });

    it('rejects a radius without an origin', () => {
      expect(() => map({ radiusKm: 25 })).toThrow('radiusKm requires lat and lon');
    });

    it('rejects distance sort without an origin', () => {
      expect(() => map({ sort: SortField.DISTANCE })).toThrow(
        'sort by distance requires lat and lon',
      );
    });

    it('defaults distance sort to nearest first but honours an explicit order', () => {
      const dto = { lat: 40.4168, lon: -3.7038, sort: SortField.DISTANCE };
      expect(map(dto).sort.direction).toBe(SortDirection.ASC);
      expect(map({ ...dto, order: SortDirection.DESC }).sort.direction).toBe(SortDirection.DESC);
    });

    it('treats a zero coordinate as present', () => {
      const criteria = map({ lat: 0, lon: 0 });
      expect(criteria.filters.geo).toEqual({ lat: 0, lon: 0 });
    });
  });

  describe('deep pagination guard', () => {
    it('allows pages up to the search window boundary', () => {
      expect(map({ page: 500, pageSize: 20 }).page).toBe(500);
      expect(map({ page: 100, pageSize: 100 }).page).toBe(100);
    });

    it('rejects pages beyond the search window', () => {
      expect(() => map({ page: 501, pageSize: 20 })).toThrow(InvalidSearchQueryError);
      expect(() => map({ page: 101, pageSize: 100 })).toThrow(/limited to the first 10000 results/);
    });
  });
});
