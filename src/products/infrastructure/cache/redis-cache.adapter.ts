import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CachePort } from '@/products/domain/ports/cache.port';

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
  ) {
    this.defaultTtl = config.get<number>('redis.ttlSeconds', 60);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`Cache get failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      this.logger.warn(`Cache set failed for ${key}: ${this.message(error)}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Cache del failed for ${key}: ${this.message(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
