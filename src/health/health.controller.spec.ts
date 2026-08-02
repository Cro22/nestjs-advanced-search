import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { HealthController } from '@/health/health.controller';
import { ElasticsearchHealthIndicator } from '@/health/indicators/elasticsearch.health';
import { RedisHealthIndicator } from '@/health/indicators/redis.health';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';

describe('HealthController', () => {
  it('checks every backing service for readiness', async () => {
    const health = {
      check: jest.fn((checks: Array<() => unknown>) => Promise.all(checks.map((c) => c()))),
    };
    const prismaIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ postgres: { status: 'up' } }),
    };
    const prisma = {};
    const elasticsearch = {
      isHealthy: jest.fn().mockResolvedValue({ elasticsearch: { status: 'up' } }),
    };
    const redis = { isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }) };
    const controller = new HealthController(
      health as unknown as HealthCheckService,
      prismaIndicator as unknown as PrismaHealthIndicator,
      prisma as PrismaService,
      elasticsearch as unknown as ElasticsearchHealthIndicator,
      redis as unknown as RedisHealthIndicator,
    );

    await expect(controller.check()).resolves.toHaveLength(3);
    expect(prismaIndicator.pingCheck).toHaveBeenCalledWith('postgres', prisma);
    expect(elasticsearch.isHealthy).toHaveBeenCalledWith('elasticsearch');
    expect(redis.isHealthy).toHaveBeenCalledWith('redis');
  });

  it('reports process liveness without checking dependencies', () => {
    const controller = new HealthController(
      {} as HealthCheckService,
      {} as PrismaHealthIndicator,
      {} as PrismaService,
      {} as ElasticsearchHealthIndicator,
      {} as RedisHealthIndicator,
    );

    expect(controller.liveness()).toEqual({ status: 'ok' });
  });
});
