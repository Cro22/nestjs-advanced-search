import { GeoPoint } from '@/products/domain/geo';
import { Product } from '@/products/domain/product';
import { HitHighlights, ProductSearchResult } from '@/products/domain/search/search-result';

export interface ProductResponse {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  coordinates?: GeoPoint;
  price: number;
  popularity: number;
  createdAt: string;
}

export interface SearchHitResponse extends ProductResponse {
  score: number;
  highlights?: HitHighlights;
  distanceKm?: number;
}

export interface SearchResponse {
  data: SearchHitResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    /** Cursor for the next page of deep pagination, or null on the last page. */
    nextCursor: string | null;
  };
  facets: ProductSearchResult['facets'];
  suggestions: string[];
}

function toProductResponse(product: {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  coordinates?: GeoPoint;
  price: number;
  popularity: number;
  createdAt: Date;
}): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    subcategories: product.subcategories,
    location: product.location,
    ...(product.coordinates ? { coordinates: product.coordinates } : {}),
    price: product.price,
    popularity: product.popularity,
    createdAt: new Date(product.createdAt).toISOString(),
  };
}

export function toSearchResponse(result: ProductSearchResult): SearchResponse {
  return {
    data: result.hits.map((hit) => ({
      ...toProductResponse(hit.product),
      score: hit.score,
      ...(hit.highlights ? { highlights: hit.highlights } : {}),
      ...(hit.distanceKm !== undefined ? { distanceKm: hit.distanceKm } : {}),
    })),
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.ceil(result.total / result.pageSize) || 0,
      nextCursor: result.nextCursor,
    },
    facets: result.facets,
    suggestions: result.suggestions,
  };
}

export function toProductResponseFromDomain(product: Product): ProductResponse {
  return toProductResponse(product);
}
