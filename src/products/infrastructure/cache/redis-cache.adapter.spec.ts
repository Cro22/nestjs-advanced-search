import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisCacheAdapter } from '@/products/infrastructure/cache/redis-cache.adapter';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';

describe('RedisCacheAdapter', () => {
  let client: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    quit: jest.Mock;
    disconnect: jest.Mock;
  };
  let metrics: { cacheOperations: { inc: jest.Mock } };
  let adapter: RedisCacheAdapter;

  beforeEach(() => {
    client = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      quit: jest.fn(),
      disconnect: jest.fn(),
    };
    metrics = { cacheOperations: { inc: jest.fn() } };
    const config = {
      get: jest.fn((_key: string, def: unknown) => def ?? 60),
    } as unknown as ConfigService;
    adapter = new RedisCacheAdapter(
      client as unknown as Redis,
      config,
      metrics as unknown as MetricsService,
    );
  });

  describe('get', () => {
    it('parses a hit and records it', async () => {
      client.get.mockResolvedValue(JSON.stringify({ a: 1 }));
      await expect(adapter.get('k')).resolves.toEqual({ a: 1 });
      expect(metrics.cacheOperations.inc).toHaveBeenCalledWith({
        operation: 'get',
        outcome: 'hit',
      });
    });

    it('returns null and records a miss', async () => {
      client.get.mockResolvedValue(null);
      await expect(adapter.get('k')).resolves.toBeNull();
      expect(metrics.cacheOperations.inc).toHaveBeenCalledWith({
        operation: 'get',
        outcome: 'miss',
      });
    });

    it('degrades to null on error', async () => {
      client.get.mockRejectedValue(new Error('down'));
      await expect(adapter.get('k')).resolves.toBeNull();
      expect(metrics.cacheOperations.inc).toHaveBeenCalledWith({
        operation: 'get',
        outcome: 'error',
      });
    });
  });

  describe('set', () => {
    it('writes with the default ttl', async () => {
      client.set.mockResolvedValue('OK');
      await adapter.set('k', { a: 1 });
      expect(client.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), 'EX', 60);
    });

    it('honours an explicit ttl', async () => {
      client.set.mockResolvedValue('OK');
      await adapter.set('k', 1, 5);
      expect(client.set).toHaveBeenCalledWith('k', '1', 'EX', 5);
    });

    it('swallows errors', async () => {
      client.set.mockRejectedValue(new Error('down'));
      await expect(adapter.set('k', 1)).resolves.toBeUndefined();
    });
  });

  describe('del and incr', () => {
    it('deletes a key', async () => {
      client.del.mockResolvedValue(1);
      await adapter.del('k');
      expect(client.del).toHaveBeenCalledWith('k');
    });

    it('swallows del errors', async () => {
      client.del.mockRejectedValue(new Error('x'));
      await expect(adapter.del('k')).resolves.toBeUndefined();
    });

    it('increments and returns the value', async () => {
      client.incr.mockResolvedValue(7);
      await expect(adapter.incr('k')).resolves.toBe(7);
    });

    it('returns null when incr fails', async () => {
      client.incr.mockRejectedValue(new Error('x'));
      await expect(adapter.incr('k')).resolves.toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('quits cleanly when connected', async () => {
      client.quit.mockResolvedValue('OK');
      await adapter.onModuleDestroy();
      expect(client.quit).toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects when quit throws', async () => {
      client.quit.mockRejectedValue(new Error('never connected'));
      await adapter.onModuleDestroy();
      expect(client.disconnect).toHaveBeenCalled();
    });
  });
});
