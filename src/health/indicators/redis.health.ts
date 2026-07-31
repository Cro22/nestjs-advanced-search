import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/products/infrastructure/cache/redis-cache.adapter';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.client.ping();
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Redis ping failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
