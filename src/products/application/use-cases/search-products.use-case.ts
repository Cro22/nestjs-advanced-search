import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { CACHE_PORT, CachePort } from '@/products/domain/ports/cache.port';
import { ProductSearchCriteria } from '@/products/domain/search/search-criteria';
import { ProductSearchResult } from '@/products/domain/search/search-result';

/**
 * Orchestrates a product search. Elasticsearch owns relevance, faceting and
 * suggestions; Redis caches full result pages for a short window so repeated
 * identical queries (common while a user tweaks filters) stay cheap.
 */
@Injectable()
export class SearchProductsUseCase {
  private readonly cacheTtlSeconds = 30;

  constructor(
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async execute(criteria: ProductSearchCriteria): Promise<ProductSearchResult> {
    const cacheKey = this.buildCacheKey(criteria);

    const cached = await this.cache.get<ProductSearchResult>(cacheKey);
    if (cached) {
      return this.rehydrate(cached);
    }

    const result = await this.searchIndex.search(criteria);
    await this.cache.set(cacheKey, result, this.cacheTtlSeconds);
    return result;
  }

  private buildCacheKey(criteria: ProductSearchCriteria): string {
    // Stable key: sort object entries so filter order does not matter.
    const normalized = {
      text: criteria.text?.trim().toLowerCase() ?? '',
      filters: {
        categories: [...(criteria.filters.categories ?? [])].sort(),
        subcategories: [...(criteria.filters.subcategories ?? [])].sort(),
        locations: [...(criteria.filters.locations ?? [])].sort(),
        price: criteria.filters.price ?? {},
      },
      sort: criteria.sort,
      page: criteria.page,
      pageSize: criteria.pageSize,
    };
    return `search:${JSON.stringify(normalized)}`;
  }

  /** Dates survive JSON as strings; restore them on cache hits. */
  private rehydrate(result: ProductSearchResult): ProductSearchResult {
    return {
      ...result,
      hits: result.hits.map((hit) => ({
        ...hit,
        product: { ...hit.product, createdAt: new Date(hit.product.createdAt) },
      })),
    };
  }
}
