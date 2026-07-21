import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');

export function createElasticsearchClient(config: ConfigService): Client {
  return new Client({
    node: config.get<string>('elasticsearch.node'),
    // Reasonable defaults for a demo cluster; tune per environment.
    maxRetries: 3,
    requestTimeout: 30_000,
  });
}
