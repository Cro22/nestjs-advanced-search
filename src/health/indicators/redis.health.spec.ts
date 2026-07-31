import Redis from 'ioredis';
import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from '@/health/indicators/redis.health';

describe('RedisHealthIndicator', () => {
  it('reports up when redis answers the ping', async () => {
    const client = { ping: jest.fn().mockResolvedValue('PONG') } as unknown as Redis;
    const indicator = new RedisHealthIndicator(client);

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'up' },
    });
  });

  it('throws a HealthCheckError when the ping fails', async () => {
    const client = {
      ping: jest.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as Redis;
    const indicator = new RedisHealthIndicator(client);

    await expect(indicator.isHealthy('redis')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
