import { Product } from '@/products/domain/product';
import { ProductSearchCriteria } from '@/products/domain/search/search-criteria';
import { ProductSearchResult } from '@/products/domain/search/search-result';

/**
 * Read/search model port. Backed by Elasticsearch.
 * Owns full text search, relevance, faceting, autocomplete and suggestions.
 */
export interface ProductSearchIndex {
  /** Create the live index (with analyzers and mappings) if it does not exist. */
  ensureIndex(): Promise<void>;

  /**
   * Zero downtime rebuild protocol. startRebuild creates a fresh staging
   * index; subsequent bulkIndex calls fill it while the live index keeps
   * serving; finishRebuild atomically points reads at the staging index and
   * discards the previous one, stamping it with the content checksum so a later
   * boot can tell whether the projection still matches Postgres. abortRebuild
   * throws the staging index away.
   */
  startRebuild(): Promise<void>;
  finishRebuild(checksum?: string): Promise<void>;
  abortRebuild(): Promise<void>;

  /** Whether the live index was built with the current schema version. */
  isCurrentSchema(): Promise<boolean>;

  /**
   * Content checksum stamped on the live index at its last rebuild, or null
   * when the index does not exist or predates checksum stamping.
   */
  getContentChecksum(): Promise<string | null>;

  /** Number of documents currently in the live index (0 if it does not exist). */
  countDocuments(): Promise<number>;

  index(product: Product): Promise<void>;

  /** Remove a document from the index. Missing documents are not an error. */
  remove(productId: string): Promise<void>;

  bulkIndex(products: Product[]): Promise<void>;

  search(criteria: ProductSearchCriteria): Promise<ProductSearchResult>;

  /** Prefix based suggestions for the autocomplete box. */
  autocomplete(prefix: string, limit: number): Promise<string[]>;
}

export const PRODUCT_SEARCH_INDEX = Symbol('PRODUCT_SEARCH_INDEX');
