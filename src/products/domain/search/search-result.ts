import { ProductProps } from '@/products/domain/product';

/**
 * Read side view of a product. The search result carries plain data (no
 * aggregate behaviour) so it serializes cleanly into the cache and the HTTP
 * response. The write model keeps using the Product class.
 */
export type ProductView = ProductProps;

/** Fragments of the matched fields with the query terms wrapped in em tags. */
export interface HitHighlights {
  name?: string;
  description?: string;
}

export interface ProductSearchHit {
  product: ProductView;
  /** Relevance score assigned by the search engine for this query. */
  score: number;
  /** Present only for text queries when the engine produced fragments. */
  highlights?: HitHighlights;
  /** Distance from the search origin, present only when sorting by distance. */
  distanceKm?: number;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface PriceStats {
  min: number;
  max: number;
  avg: number;
}

/**
 * Facets are computed so that each facet ignores its own active filter but
 * honours every other filter (combined faceting). This is what lets a user
 * keep seeing sibling categories after picking one.
 */
export interface ProductFacets {
  categories: FacetBucket[];
  subcategories: FacetBucket[];
  locations: FacetBucket[];
  price: PriceStats | null;
}

export interface ProductSearchResult {
  hits: ProductSearchHit[];
  total: number;
  page: number;
  pageSize: number;
  facets: ProductFacets;
  /** Alternative or related query terms (did you mean / related searches). */
  suggestions: string[];
  /**
   * Cursor to fetch the next page with deep pagination, or null when this is the
   * last page. Present regardless of which pagination mode the request used.
   */
  nextCursor: string | null;
}
