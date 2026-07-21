export enum SortField {
  RELEVANCE = 'relevance',
  POPULARITY = 'popularity',
  CREATED_AT = 'created_at',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export interface PriceRange {
  min?: number;
  max?: number;
}

export interface ProductSearchFilters {
  categories?: string[];
  subcategories?: string[];
  locations?: string[];
  price?: PriceRange;
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
