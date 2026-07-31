import { ThrottlerStorage } from '@nestjs/throttler';
import { ResilientThrottlerStorage } from '@/shared/infrastructure/http/resilient-throttler.storage';

describe('ResilientThrottlerStorage', () => {
  const record = { totalHits: 5, timeToExpire: 30, isBlocked: false, timeToBlockExpire: 0 };

  it('delegates to the inner storage and returns its record', async () => {
    const inner: ThrottlerStorage = { increment: jest.fn().mockResolvedValue(record) };
    const storage = new ResilientThrottlerStorage(inner);

    const result = await storage.increment('key', 60, 120, 0, 'default');

    expect(result).toBe(record);
    expect(inner.increment).toHaveBeenCalledWith('key', 60, 120, 0, 'default');
  });

  it('fails open when the inner storage rejects', async () => {
    const inner: ThrottlerStorage = {
      increment: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const storage = new ResilientThrottlerStorage(inner);

    const result = await storage.increment('key', 60, 120, 0, 'default');

    expect(result.isBlocked).toBe(false);
    expect(result.totalHits).toBe(1);
    expect(result.timeToExpire).toBe(60);
  });
});
