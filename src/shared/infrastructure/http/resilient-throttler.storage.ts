import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Wraps a throttler storage and decides what happens when the backing store
 * (Redis) is unreachable. Rate limiting is protection, not correctness, so the
 * failure mode is a deliberate choice rather than an accident:
 *
 *   - fail open (default): let the request through, favouring availability. A
 *     brief outage of the limiter never turns every routed call into an error.
 *   - fail closed: refuse the request with 503, favouring protection. An API
 *     under active abuse would rather shed load than serve unmetered.
 */
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name);

  /**
   * `keyPrefix` namespaces the counters in Redis. It is empty in production,
   * where one deployment owns its budgets, and set per environment when a
   * Redis instance is shared so counters never bleed across them. `failOpen`
   * selects the behaviour when the store is down.
   */
  constructor(
    private readonly inner: ThrottlerStorage,
    private readonly keyPrefix = '',
    private readonly failOpen = true,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const namespacedKey = this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
    try {
      return await this.inner.increment(namespacedKey, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!this.failOpen) {
        this.logger.error(`Throttler storage unavailable, refusing the request: ${reason}`);
        throw new ServiceUnavailableException('Rate limiter unavailable');
      }
      this.logger.warn(`Throttler storage unavailable, letting the request through: ${reason}`);
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
