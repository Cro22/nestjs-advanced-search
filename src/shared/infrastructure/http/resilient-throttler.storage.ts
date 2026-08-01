import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Fail open wrapper around a throttler storage. Rate limiting is protection,
 * not correctness: if the backing store (Redis) is unreachable, requests are
 * allowed through instead of turning every routed call into a 500.
 */
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name);

  /**
   * `keyPrefix` namespaces the counters in Redis. It is empty in production,
   * where one deployment owns its budgets, and set per environment when a
   * Redis instance is shared so counters never bleed across them.
   */
  constructor(
    private readonly inner: ThrottlerStorage,
    private readonly keyPrefix = '',
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
      this.logger.warn(
        `Throttler storage unavailable, letting the request through: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
