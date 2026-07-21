import { Product } from '@/products/domain/product';
import { ProductSearchResult } from '@/products/domain/search/search-result';

export interface ProductResponse {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  price: number;
  popularity: number;
  createdAt: string;
}

export interface SearchResponse {
  data: Array<ProductResponse & { score: number }>;
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
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
    })),
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.ceil(result.total / result.pageSize) || 0,
    },
    facets: result.facets,
    suggestions: result.suggestions,
  };
}

export function toProductResponseFromDomain(product: Product): ProductResponse {
  return toProductResponse(product);
}
