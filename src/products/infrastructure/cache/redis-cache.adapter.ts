import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CachePort } from '@/products/domain/ports/cache.port';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export function createRedisClient(config: ConfigService): Redis {
  return new Redis({
    host: config.get<string>('redis.host'),
    port: config.get<number>('redis.port'),
    lazyConnect: false,
    maxRetriesPerRequest: 2,
  });
}

/**
 * Redis backed cache. A cache outage must never take the API down, so every
 * operation degrades gracefully: reads fall through to the source, writes are
 * best effort.
 */
@Injectable()
export class RedisCacheAdapter implements CachePort, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheAdapter.name);
  private readonly defaultTtl: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    config: ConfigService,
    // Optional so unit tests can build the adapter without a registry.
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.defaultTtl = config.get<number>('redis.ttlSeconds', 60);
  }

  private record(operation: string, outcome: 'hit' | 'miss' | 'ok' | 'error'): void {
    this.metrics?.cacheOperations.inc({ operation, outcome });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      this.record('get', raw ? 'hit' : 'miss');
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.record('get', 'error');
      this.logger.warn(`Cache get failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
      this.record('set', 'ok');
    } catch (error) {
      this.record('set', 'error');
      this.logger.warn(`Cache set failed for ${key}: ${this.message(error)}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.record('del', 'ok');
    } catch (error) {
      this.record('del', 'error');
      this.logger.warn(`Cache del failed for ${key}: ${this.message(error)}`);
    }
  }

  async incr(key: string): Promise<number | null> {
    try {
      const value = await this.client.incr(key);
      this.record('incr', 'ok');
      return value;
    } catch (error) {
      this.record('incr', 'error');
      this.logger.warn(`Cache incr failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // A connection that never established cannot QUIT; drop it instead so
      // shutdown never hangs on a dead cache.
      this.client.disconnect();
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
