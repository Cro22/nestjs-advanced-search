import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { Client } from '@elastic/elasticsearch';
import { ELASTICSEARCH_CLIENT } from '@/products/infrastructure/search/elasticsearch.client';

@Injectable()
export class ElasticsearchHealthIndicator extends HealthIndicator {
  constructor(@Inject(ELASTICSEARCH_CLIENT) private readonly client: Client) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.client.ping();
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Elasticsearch ping failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
