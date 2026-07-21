import { toSearchCriteria } from '@/products/infrastructure/http/search-criteria.mapper';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';
import { SortDirection, SortField } from '@/products/domain/search/search-criteria';

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
});
