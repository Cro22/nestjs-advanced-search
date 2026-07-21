import { Product } from '@/products/domain/product';
import { ProductSearchCriteria } from '@/products/domain/search/search-criteria';
import { ProductSearchResult } from '@/products/domain/search/search-result';

/**
 * Read/search model port. Backed by Elasticsearch.
 * Owns full text search, relevance, faceting, autocomplete and suggestions.
 */
export interface ProductSearchIndex {
  /** Create the index with its analyzers and mappings if it does not exist. */
  ensureIndex(): Promise<void>;

  /** Drop and recreate the index. Used before a full reindex. */
  recreateIndex(): Promise<void>;

  index(product: Product): Promise<void>;

  bulkIndex(products: Product[]): Promise<void>;

  search(criteria: ProductSearchCriteria): Promise<ProductSearchResult>;

  /** Prefix based suggestions for the autocomplete box. */
  autocomplete(prefix: string, limit: number): Promise<string[]>;
}

export const PRODUCT_SEARCH_INDEX = Symbol('PRODUCT_SEARCH_INDEX');
