import {
  DEFAULT_SORT,
  GeoFilter,
  ProductSearchCriteria,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';
import { InvalidSearchQueryError } from '@/products/domain/search/search.errors';
import {
  clampPageSize,
  decodeCursor,
  MAX_SEARCH_WINDOW,
  normalizePage,
} from '@/shared/domain/pagination';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';

/** Directions that only make sense one way are normalized for a nicer API. */
function resolveSort(dto: SearchProductsQueryDto): { field: SortField; direction: SortDirection } {
  const field = dto.sort ?? DEFAULT_SORT.field;
  if (dto.order) {
    return { field, direction: dto.order };
  }
  // Distance naturally reads nearest first; the other fields default to desc
  // (most relevant / most popular / newest first).
  const direction = field === SortField.DISTANCE ? SortDirection.ASC : SortDirection.DESC;
  return { field, direction };
}

/**
 * lat and lon travel as separate query params, so consistency between them
 * (and with radiusKm and sort=distance) can only be checked here.
 */
function resolveGeo(dto: SearchProductsQueryDto): GeoFilter | undefined {
  const hasLat = dto.lat !== undefined;
  const hasLon = dto.lon !== undefined;

  if (hasLat !== hasLon) {
    throw new InvalidSearchQueryError('lat and lon must be provided together');
  }
  if (!hasLat) {
    if (dto.radiusKm !== undefined) {
      throw new InvalidSearchQueryError('radiusKm requires lat and lon');
    }
    return undefined;
  }
  return {
    lat: dto.lat as number,
    lon: dto.lon as number,
    ...(dto.radiusKm !== undefined ? { radiusKm: dto.radiusKm } : {}),
  };
}

export function toSearchCriteria(
  dto: SearchProductsQueryDto,
  maxPageSize: number,
): ProductSearchCriteria {
  const price =
    dto.minPrice !== undefined || dto.maxPrice !== undefined
      ? { min: dto.minPrice, max: dto.maxPrice }
      : undefined;

  const geo = resolveGeo(dto);
  const sort = resolveSort(dto);
  if (sort.field === SortField.DISTANCE && !geo) {
    throw new InvalidSearchQueryError('sort by distance requires lat and lon');
  }

  const page = normalizePage(dto.page);
  const pageSize = clampPageSize(dto.pageSize, maxPageSize);

  // Cursor pagination and page based pagination are mutually exclusive: mixing
  // an offset with search_after is ambiguous, so it is rejected outright.
  const searchAfter = resolveCursor(dto, page);
  if (!searchAfter && page * pageSize > MAX_SEARCH_WINDOW) {
    throw new InvalidSearchQueryError(
      `Offset pagination is limited to the first ${MAX_SEARCH_WINDOW} results. Use the cursor from meta.nextCursor to page deeper.`,
    );
  }

  return {
    text: dto.q?.trim() || undefined,
    filters: {
      categories: dto.categories,
      subcategories: dto.subcategories,
      locations: dto.locations,
      price,
      geo,
    },
    sort,
    page,
    pageSize,
    ...(searchAfter ? { searchAfter } : {}),
  };
}

function resolveCursor(dto: SearchProductsQueryDto, page: number): unknown[] | undefined {
  if (dto.cursor === undefined) {
    return undefined;
  }
  if (page > 1) {
    throw new InvalidSearchQueryError('cursor and page cannot be combined');
  }
  const decoded = decodeCursor(dto.cursor);
  if (!decoded) {
    throw new InvalidSearchQueryError('Malformed pagination cursor');
  }
  return decoded;
}
