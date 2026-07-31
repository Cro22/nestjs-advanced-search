import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { CACHE_PORT, CachePort } from '@/products/domain/ports/cache.port';
import { SEARCH_SCHEMA_VERSION } from '@/products/domain/search/search-version';
import { GENERATION_KEY } from '@/products/application/cache-keys';

export interface AutocompleteQuery {
  prefix: string;
  limit: number;
}

/**
 * Autocomplete backed by Elasticsearch and cached in Redis. Prefix queries are
 * highly repetitive as a user types, so a short lived cache absorbs most of the
 * load while keeping suggestions fresh.
 */
@Injectable()
export class AutocompleteUseCase {
  private readonly cacheTtlSeconds = 60;

  constructor(
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async execute({ prefix, limit }: AutocompleteQuery): Promise<string[]> {
    const normalized = prefix.trim().toLowerCase();
    if (normalized.length === 0) {
      return [];
    }

    // Same generation scheme as search keys, so writes invalidate instantly.
    const generation = (await this.cache.get<number>(GENERATION_KEY)) ?? 0;
    const cacheKey = `autocomplete:v${SEARCH_SCHEMA_VERSION}:g${generation}:${limit}:${normalized}`;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const suggestions = await this.searchIndex.autocomplete(normalized, limit);
    await this.cache.set(cacheKey, suggestions, this.cacheTtlSeconds);
    return suggestions;
  }
}
