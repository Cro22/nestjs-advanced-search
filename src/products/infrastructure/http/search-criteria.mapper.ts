import {
  DEFAULT_SORT,
  ProductSearchCriteria,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';
import { clampPageSize, normalizePage } from '@/shared/domain/pagination';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';

/** Directions that only make sense one way are normalized for a nicer API. */
function resolveSort(dto: SearchProductsQueryDto): { field: SortField; direction: SortDirection } {
  const field = dto.sort ?? DEFAULT_SORT.field;
  // Relevance is always most relevant first; the other fields default to desc
  // (most popular / newest first) but honour an explicit order.
  const direction = dto.order ?? SortDirection.DESC;
  return { field, direction };
}

export function toSearchCriteria(
  dto: SearchProductsQueryDto,
  maxPageSize: number,
): ProductSearchCriteria {
  const price =
    dto.minPrice !== undefined || dto.maxPrice !== undefined
      ? { min: dto.minPrice, max: dto.maxPrice }
      : undefined;

  return {
    text: dto.q?.trim() || undefined,
    filters: {
      categories: dto.categories,
      subcategories: dto.subcategories,
      locations: dto.locations,
      price,
    },
    sort: resolveSort(dto),
    page: normalizePage(dto.page),
    pageSize: clampPageSize(dto.pageSize, maxPageSize),
  };
}
