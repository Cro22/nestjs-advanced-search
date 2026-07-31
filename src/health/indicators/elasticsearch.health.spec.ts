import { Client } from '@elastic/elasticsearch';
import { HealthCheckError } from '@nestjs/terminus';
import { ElasticsearchHealthIndicator } from '@/health/indicators/elasticsearch.health';

describe('ElasticsearchHealthIndicator', () => {
  it('reports up when the cluster answers the ping', async () => {
    const client = { ping: jest.fn().mockResolvedValue(true) } as unknown as Client;
    const indicator = new ElasticsearchHealthIndicator(client);

    await expect(indicator.isHealthy('elasticsearch')).resolves.toEqual({
      elasticsearch: { status: 'up' },
    });
  });

  it('throws a HealthCheckError with the failure message when the ping fails', async () => {
    const client = {
      ping: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    } as unknown as Client;
    const indicator = new ElasticsearchHealthIndicator(client);

    await expect(indicator.isHealthy('elasticsearch')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
