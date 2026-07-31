export enum SortField {
  RELEVANCE = 'relevance',
  POPULARITY = 'popularity',
  CREATED_AT = 'created_at',
  DISTANCE = 'distance',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export interface PriceRange {
  min?: number;
  max?: number;
}

/**
 * Geographic origin of a search. When radiusKm is present it acts as a filter
 * (only products within the radius match); without it the origin only serves
 * as the reference point for distance sorting.
 */
export interface GeoFilter {
  lat: number;
  lon: number;
  radiusKm?: number;
}

export interface ProductSearchFilters {
  categories?: string[];
  subcategories?: string[];
  locations?: string[];
  price?: PriceRange;
  geo?: GeoFilter;
}

export interface ProductSort {
  field: SortField;
  direction: SortDirection;
}

/**
 * Normalized, transport agnostic description of a search request.
 * HTTP DTOs are mapped into this before reaching the use cases.
 */
export interface ProductSearchCriteria {
  text?: string;
  filters: ProductSearchFilters;
  sort: ProductSort;
  page: number; // 1 based
  pageSize: number;
}

export const DEFAULT_SORT: ProductSort = {
  field: SortField.RELEVANCE,
  direction: SortDirection.DESC,
};
