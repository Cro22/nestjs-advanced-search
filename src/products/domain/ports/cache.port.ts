/**
 * Generic cache port. Backed by Redis. Kept intentionally small so the domain
 * does not depend on any cache vendor semantics.
 */
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export const CACHE_PORT = Symbol('CACHE_PORT');
