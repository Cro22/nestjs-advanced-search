import { Product } from '@/products/domain/product';

export interface ProductPage {
  items: Product[];
  /** Opaque cursor to fetch the next page, or null when exhausted. */
  nextCursor: string | null;
}

/**
 * Write model port. Backed by Postgres (the source of truth). Mutations also
 * record a transactional outbox entry, so the search projection is guaranteed
 * to converge even when Elasticsearch is down at write time.
 */
export interface ProductRepository {
  save(product: Product): Promise<void>;
  findById(id: string): Promise<Product | null>;
  /** Returns false when the product does not exist. */
  delete(id: string): Promise<boolean>;
  /** Atomically add one to the popularity. Null when the product is missing. */
  incrementPopularity(id: string): Promise<Product | null>;
  count(): Promise<number>;
  /**
   * Keyset pagination over the whole table, used to stream products into the
   * search index during a full reindex without loading everything in memory.
   */
  findBatch(cursor: string | null, limit: number): Promise<ProductPage>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
